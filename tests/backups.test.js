'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../js/state.js');
const Backups = require('../js/backups.js');

function storage(initial = {}) {
    const values = new Map(Object.entries(initial));
    let blocked = false;
    return {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem(key, value) {
            if (blocked) throw new Error('Quota exceeded');
            values.set(key, String(value));
        },
        values, block: value => { blocked = value; }
    };
}
function state() {
    return Core.normalizeState({ version: 2, activeCategory: 'favorites', theme: 'dark', categories: [
        { id: 'charging', label: 'Mes bornes', icon: 'charging', shortcuts: [
            { id: 'shared-abrp', serviceId: 'abrp', name: 'Mon trajet 🚘', url: 'https://abetterrouteplanner.com/', categoryIds: ['charging', 'navigation'], favorite: true, clickCount: 27 }
        ] },
        { id: 'navigation', label: 'Navigation', icon: 'navigation', shortcuts: [] }
    ] });
}
const failure = key => error => error.i18nKey === key;

test('adding a local backup preserves the active portal and round-trips one canonical shared service', () => {
    const active = JSON.stringify(state());
    const saved = storage({ [Core.STORAGE_KEY]: active, 'other-app': 'untouched' });
    const library = Backups.createLibrary(saved);
    assert.deepEqual(library.list(), []);
    const input = state();
    const added = library.add({ title: '  Mes vacances  ', state: input, source: 'created' });
    assert.equal(added.title, 'Mes vacances');
    assert.match(added.id, /^backup-/);
    assert.ok(Number.isSafeInteger(added.createdAt));
    assert.deepEqual(library.get(added.id), added);
    assert.deepEqual(Backups.createLibrary(saved).list(), [added]);
    assert.equal(saved.getItem(Core.STORAGE_KEY), active);
    assert.equal(saved.getItem('other-app'), 'untouched');
    const recovered = library.get(added.id).state;
    assert.equal(Core.allShortcutEntries(recovered).length, 1);
    assert.strictEqual(Core.shortcutsForCategory(recovered, 'charging')[0].shortcut, Core.shortcutsForCategory(recovered, 'navigation')[0].shortcut);
    assert.equal(Core.shortcutsForCategory(recovered, 'navigation')[0].shortcut.clickCount, 27);
    assert.equal(Core.shortcutsForCategory(recovered, 'favorites').length, 1);
    assert.deepEqual(input, state());
});

test('untrusted metadata is validated and tokens or device preferences never enter portable backup state', () => {
    const saved = storage();
    const library = Backups.createLibrary(saved);
    const untrusted = { ...state(), access_token: 'secret-token', market: 'FR', hiddenCategoryIds: ['charging'], homeFavorites: true, language: 'fr' };
    untrusted.categories[0].shortcuts[0].password = 'shortcut-secret';
    const added = library.add({ title: '<script>alert(1)</script>', state: untrusted, source: 'file', access_token: 'top-level-secret', id: 'untrusted-id', createdAt: 1 });
    assert.equal(added.title, '<script>alert(1)</script>');
    assert.notEqual(added.id, 'untrusted-id');
    assert.notEqual(added.createdAt, 1);
    assert.deepEqual(added.state, state());
    assert.doesNotMatch(saved.getItem(Backups.STORAGE_KEY), /secret|hiddenCategoryIds|homeFavorites|"market"|"language"/);
    const original = saved.getItem(Backups.STORAGE_KEY);
    for (const patch of [
        { title: '' }, { title: ' ' }, { title: 'x'.repeat(121) }, { title: 123 },
        { source: 'cloud' }, { source: null }, { source: [] },
        { path: '../private' }, { path: 'https://attacker.example/page' }, { path: 'https://user:pass@telegra.ph/page' },
        { path: null }, { state: { version: 3, categories: [] } },
        { state: { version: 2, categories: [{ id: 'charging', label: 'Bad', shortcuts: [{ name: 'Bad', url: 'javascript:alert(1)' }] }] } }
    ]) {
        assert.throws(() => library.add({ title: 'Valid', state: state(), source: 'file', ...patch }), failure('backup.invalidBackup'));
        assert.equal(saved.getItem(Backups.STORAGE_KEY), original);
    }
    assert.throws(() => library.add(null), failure('backup.invalidBackup'));
    assert.throws(() => library.get({}), failure('backup.invalidBackup'));
    assert.throws(() => library.remove('../path'), failure('backup.invalidBackup'));
});

test('a repeated Telegraph path updates its record while same-title files and transfers stay distinct', () => {
    const saved = storage();
    const library = Backups.createLibrary(saved);
    const first = library.add({ title: 'Voyage', source: 'created', path: 'EvPortal-saved-09-12', state: state() });
    const changed = state();
    changed.categories[0].shortcuts[0].name = 'Autre trajet';
    const updated = library.add({ title: 'Voyage renommé', source: 'link', path: 'https://telegra.ph/EvPortal-saved-09-12', state: changed });
    assert.equal(updated.id, first.id);
    assert.equal(updated.createdAt, first.createdAt);
    assert.equal(updated.path, first.path);
    assert.equal(updated.title, 'Voyage renommé');
    assert.equal(updated.source, 'link');
    assert.equal(library.list().length, 1);
    assert.equal(library.get(first.id).state.categories[0].shortcuts[0].name, 'Autre trajet');
    const file = library.add({ title: 'Voyage renommé', source: 'file', state: state() });
    const transfer = library.add({ title: 'Voyage renommé', source: 'transfer', state: state() });
    assert.equal(new Set([first.id, file.id, transfer.id]).size, 3);
    assert.equal(library.list().length, 3);
    assert.equal(library.list()[0].id, transfer.id);
});

test('input, returned records and list results cannot mutate an already saved backup', () => {
    const library = Backups.createLibrary(storage());
    const input = state();
    const created = library.add({ title: 'Copie', source: 'file', state: input });
    const id = created.id;
    input.categories[0].shortcuts[0].name = 'Input changed';
    created.state.categories[0].shortcuts[0].categoryIds.push('invented');
    created.title = 'Changed return value';
    const list = library.list();
    list[0].state.categories[0].shortcuts.length = 0;
    list.push(list[0]);
    const fetched = library.get(id);
    fetched.state.categories[1].label = 'Changed get';
    assert.equal(library.list().length, 1);
    assert.equal(library.get(id).title, 'Copie');
    assert.deepEqual(library.get(id).state, state());
});

test('independent instances reread additions, path updates and removals before every mutation', () => {
    const saved = storage();
    const first = Backups.createLibrary(saved);
    const second = Backups.createLibrary(saved);
    const a = first.add({ title: 'A', source: 'link', path: 'page-a', state: state() });
    const b = second.add({ title: 'B', source: 'file', state: state() });
    assert.equal(first.list().length, 2);
    const updated = first.add({ title: 'A actualisée', source: 'created', path: 'page-a', state: state() });
    assert.equal(updated.id, a.id);
    assert.equal(second.get(a.id).title, 'A actualisée');
    assert.equal(second.remove(b.id), true);
    const c = first.add({ title: 'C', source: 'transfer', state: state() });
    assert.deepEqual(new Set(second.list().map(item => item.id)), new Set([a.id, c.id]));
    assert.equal(first.remove('missing'), false);
    assert.equal(first.get(b.id), null);
});

test('quota failures on add, replacement or removal leave all previous data intact and allow retry', () => {
    const saved = storage({ [Core.STORAGE_KEY]: 'active-untouched' });
    const library = Backups.createLibrary(saved);
    const first = library.add({ title: 'Initiale', source: 'link', path: 'page', state: state() });
    const original = saved.getItem(Backups.STORAGE_KEY);
    saved.block(true);
    for (const operation of [
        () => library.add({ title: 'Nouvelle', source: 'file', state: state() }),
        () => library.add({ title: 'Remplacement', source: 'link', path: 'page', state: state() }),
        () => library.remove(first.id)
    ]) {
        assert.throws(operation, failure('backup.storageUnavailable'));
        assert.equal(saved.getItem(Backups.STORAGE_KEY), original);
        assert.equal(saved.getItem(Core.STORAGE_KEY), 'active-untouched');
    }
    assert.deepEqual(library.get(first.id), first);
    saved.block(false);
    assert.equal(library.remove(first.id), true);
    assert.deepEqual(library.list(), []);
});

test('corrupt, future or ambiguous libraries reject mutation without deleting the original key', () => {
    const goodStorage = storage();
    const record = Backups.createLibrary(goodStorage).add({ title: 'Good', source: 'link', path: 'path', state: state() });
    const fixtures = [
        '{broken', 'null', '[]', JSON.stringify({ version: 2, backups: [] }),
        JSON.stringify({ version: 1, backups: {} }),
        JSON.stringify({ version: 1, backups: [{ ...record, createdAt: 'yesterday' }] }),
        JSON.stringify({ version: 1, backups: [{ ...record, state: { version: 3, categories: [] } }] }),
        JSON.stringify({ version: 1, backups: [record, record] }),
        JSON.stringify({ version: 1, backups: [record, { ...record, id: 'other-id' }] })
    ];
    for (const raw of fixtures) {
        const saved = storage({ [Backups.STORAGE_KEY]: raw });
        const library = Backups.createLibrary(saved);
        for (const operation of [() => library.list(), () => library.get(record.id), () => library.remove(record.id), () => library.add({ title: 'New', source: 'file', state: state() })]) {
            assert.throws(operation, failure('backup.invalidLibrary'));
            assert.equal(saved.getItem(Backups.STORAGE_KEY), raw);
        }
    }
    for (const unavailable of [null, { getItem() { throw new Error('Blocked'); } }]) {
        assert.throws(() => Backups.createLibrary(unavailable).list(), failure('backup.storageUnavailable'));
    }
});

test('the fifty-backup cap permits a path refresh and a slot freed by deletion', () => {
    const library = Backups.createLibrary(storage());
    const first = library.add({ title: 'Initiale', source: 'link', path: 'same-page', state: state() });
    for (let index = 1; index < Backups.MAX_BACKUPS; index += 1) library.add({ title: 'Copie', source: 'file', state: state() });
    assert.equal(library.list().length, 50);
    assert.throws(() => library.add({ title: 'Trop', source: 'file', state: state() }), error => error.i18nKey === 'backup.limit' && error.i18nParams.max === 50);
    assert.equal(library.add({ title: 'Actualisée', source: 'link', path: 'same-page', state: state() }).id, first.id);
    assert.equal(library.list().length, 50);
    library.remove(first.id);
    assert.ok(library.add({ title: 'Disponible', source: 'transfer', state: state() }).id);
    assert.equal(library.list().length, 50);
});

test('the UTF-8 record size is bounded before any write even when the underlying state is valid', () => {
    const saved = storage();
    const library = Backups.createLibrary(saved);
    const large = Core.normalizeState({ version: 2, categories: [{ id: 'personal', label: 'Liens', shortcuts: Array.from({ length: 3000 }, (_, index) => ({
        id: 'link-' + index, name: 'Lien ' + index, url: 'https://example.org/' + index, description: '😀'.repeat(150)
    })) }] });
    assert.ok(new TextEncoder().encode(JSON.stringify(large)).length > Core.MAX_FILE_BYTES);
    assert.throws(() => library.add({ title: 'Trop grande', source: 'file', state: large }), failure('backup.tooLarge'));
    assert.equal(saved.getItem(Backups.STORAGE_KEY), null);
});

test('the browser UMD exposes EVBackups without network or implicit state writes', () => {
    const saved = storage();
    const context = { EVState: Core, TextEncoder, Date, localStorage: saved };
    vm.runInNewContext(fs.readFileSync(require.resolve('../js/backups.js'), 'utf8'), context);
    assert.equal(typeof context.EVBackups.createLibrary, 'function');
    const record = context.EVBackups.createLibrary().add({ title: 'Navigateur', state: state(), source: 'created' });
    assert.ok(record.id);
    assert.equal(saved.getItem(Core.STORAGE_KEY), null);
    assert.deepEqual(Array.from(saved.values.keys()), [Backups.STORAGE_KEY]);
});
