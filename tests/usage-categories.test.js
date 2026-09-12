'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/state.js');
const Telegraph = require('../js/telegraph.js');
const Backups = require('../js/backups.js');

const catalog = {
    version: 'test',
    categories: [
        { id: 'cinema', label: 'Vidéo', shortcuts: [
            { id: 'cinema-one', name: 'Même nom', url: 'https://example.org/' },
            { id: 'cinema-two', name: 'Autre', url: 'https://other.example.org/' }
        ] },
        { id: 'music', label: 'Musique', shortcuts: [
            { id: 'music-one', name: 'Même nom', url: 'https://example.org/' }
        ] }
    ]
};

function storage() {
    const data = new Map();
    return { getItem: key => data.has(key) ? data.get(key) : null, setItem: (key, value) => data.set(key, String(value)) };
}

function customCategory(index, patch = {}) {
    return { id: 'personal-' + index, label: 'Perso ' + index, shortcuts: [], ...patch };
}

test('old version 2 states gain zero counters and matching category icons without losing data', () => {
    const old = { version: 2, categories: [...structuredClone(catalog.categories), customCategory(1)] };
    const next = Core.normalizeState(old);
    assert.deepEqual(next.categories.map(category => category.icon), ['cinema', 'music', 'folder']);
    assert.deepEqual(next.categories.flatMap(category => category.shortcuts.map(shortcut => shortcut.clickCount)), [0, 0, 0]);
    assert.equal(old.categories[0].icon, undefined);
    assert.equal(old.categories[0].shortcuts[0].clickCount, undefined);
    assert.deepEqual(next.categories.map(category => category.label), old.categories.map(category => category.label));
});

test('legacy states keep category icon defaults and shortcut counters when supplied', () => {
    const legacy = Core.fromLegacy({ pages: ['cinema', 'Vacances'], cinema: [
        { name: 'Vidéo', url: 'https://example.org/', clickCount: 7 }
    ], Vacances: [] }, catalog);
    assert.equal(legacy.categories[0].icon, 'cinema');
    assert.equal(legacy.categories[1].icon, 'folder');
    assert.equal(legacy.categories[0].shortcuts[0].clickCount, 7);
});

test('a click belongs to a shortcut ID, including duplicate names and URLs, and leaves the input untouched', () => {
    const initial = Core.fromCatalog(catalog);
    const next = Core.recordShortcutClick(Core.recordShortcutClick(initial, 'music-one'), 'music-one');
    assert.equal(next.categories[1].shortcuts[0].clickCount, 2);
    assert.equal(next.categories[0].shortcuts[0].clickCount, 0);
    assert.equal(next.categories[0].shortcuts[1].clickCount, 0);
    assert.equal(initial.categories[1].shortcuts[0].clickCount, 0);
    assert.deepEqual(next.shortcutOrder, initial.shortcutOrder);
    assert.deepEqual(Core.recordShortcutClick(next, 'missing'), next);
});

test('counters saturate at the safe integer boundary instead of corrupting the next saved state', () => {
    const initial = Core.fromCatalog(catalog);
    initial.categories[0].shortcuts[0].clickCount = Number.MAX_SAFE_INTEGER - 1;
    const next = Core.recordShortcutClick(Core.recordShortcutClick(initial, 'cinema-one'), 'cinema-one');
    assert.equal(next.categories[0].shortcuts[0].clickCount, Number.MAX_SAFE_INTEGER);
    assert.doesNotThrow(() => Core.normalizeState(next));
});

test('invalid counters reject the entire import and never overwrite an existing saved state', () => {
    const saved = storage();
    const valid = Core.fromCatalog(catalog);
    assert.equal(Core.saveState(saved, valid), true);
    const original = saved.getItem(Core.STORAGE_KEY);
    for (const value of ['12', -1, 1.2, Infinity, -Infinity, NaN, null, true, {}, [], Number.MAX_SAFE_INTEGER + 1]) {
        const input = structuredClone(valid);
        input.categories[0].shortcuts[0].clickCount = value;
        assert.throws(() => Core.normalizeState(input), /Compteur/);
        assert.throws(() => Core.parseImport(JSON.stringify(input), catalog), /Compteur/);
        assert.equal(Core.saveState(saved, input), false);
        assert.equal(saved.getItem(Core.STORAGE_KEY), original);
    }
});

test('usage sorts all categories together and resolves ties by manual order without mutating tiles', () => {
    const initial = Core.fromCatalog(catalog);
    const manual = Core.reorderShortcuts(initial, ['cinema-two', 'music-one', 'cinema-one']);
    manual.categories[0].shortcuts.find(shortcut => shortcut.id === 'cinema-one').clickCount = 3;
    manual.categories[1].shortcuts[0].clickCount = 3;
    const before = JSON.stringify(manual);
    const ranked = Core.rankShortcuts(manual);
    assert.deepEqual(ranked.map(row => row.shortcut.id), ['music-one', 'cinema-one', 'cinema-two']);
    assert.strictEqual(ranked[0].shortcut, manual.categories[1].shortcuts[0]);
    assert.strictEqual(ranked[0].category, manual.categories[1]);
    assert.equal(JSON.stringify(manual), before);
    assert.deepEqual(Core.rankShortcuts(initial).map(row => row.shortcut.id), initial.shortcutOrder);
});

test('custom icons and usage survive local storage, JSON export, catalogue updates and Telegra.ph content', () => {
    const input = Core.recordShortcutClick(Core.fromCatalog(catalog), 'music-one');
    input.categories.push(customCategory(1, { icon: 'charging' }));
    input.categories[0].icon = 'tv';
    const state = Core.normalizeState(input);
    const saved = storage();
    assert.equal(Core.saveState(saved, state), true);
    assert.deepEqual(Core.loadState(saved, catalog).state, state);
    assert.deepEqual(Core.parseImport(JSON.stringify(state), catalog), state);
    const nodes = JSON.parse(Telegraph.contentForState(state));
    assert.deepEqual(Core.parseImport(nodes[0].children[0], catalog), state);
});

test('only existing sprite icons can be imported or selected, while absent icons fall back safely', () => {
    assert.equal(Object.isFrozen(Core.CATEGORY_ICONS), true);
    for (const icon of Core.CATEGORY_ICONS) {
        const input = { version: 2, categories: [customCategory(1, { icon })] };
        assert.equal(Core.normalizeState(input).categories[0].icon, icon);
    }
    for (const icon of ['missing', '#icon-folder', 'https://example.org/icon.svg', '<svg>', '', null, 123, {}, []]) {
        assert.throws(() => Core.normalizeState({ version: 2, categories: [customCategory(1, { icon })] }), /Icône/);
    }
    assert.equal(Core.normalizeState({ version: 2, categories: [customCategory(1)] }).categories[0].icon, 'folder');
});

test('all new category icons survive state, local-backup and Telegraph round-trips without removing historical icons', () => {
    const historical = ['all', 'favorites', 'cinema', 'music', 'tv', 'charging', 'games', 'navigation', 'social', 'news', 'weather', 'productivity', 'folder'];
    const added = ['home', 'car', 'parking', 'map', 'globe', 'compass', 'coffee', 'food', 'shopping', 'heart', 'camera', 'tools'];
    assert.deepEqual(Core.CATEGORY_ICONS, [...historical, ...added]);
    for (const icon of added) {
        const state = Core.normalizeState({ version: 2, categories: [customCategory(1, { icon, shortcuts: [
            { id: 'my-link', name: 'Ma pause', url: 'https://example.org/', favorite: true, clickCount: 8 }
        ] })] });
        const saved = storage();
        assert.equal(Core.saveState(saved, state), true);
        assert.deepEqual(Core.loadState(saved, catalog).state.categories, state.categories);
        assert.deepEqual(Core.parseImport(JSON.stringify(state)).categories, state.categories);
        const library = Backups.createLibrary(saved);
        const record = library.add({ title: 'Ma catégorie', state, source: 'file' });
        assert.deepEqual(Backups.createLibrary(saved).get(record.id).state, state);
        const content = JSON.parse(Telegraph.contentForState(state));
        assert.deepEqual(Core.parseImport(content[0].children[0]), state);
    }
});

test('the creation cap counts five personal categories independently from the remaining default categories', () => {
    const state = Core.fromCatalog(catalog);
    assert.equal(Core.MAX_CUSTOM_CATEGORIES, 5);
    assert.equal(Core.MAX_NEW_CATEGORY_NAME, 16);
    for (let index = 1; index <= Core.MAX_CUSTOM_CATEGORIES; index += 1) {
        assert.equal(Core.canCreateCategory(state, catalog), true);
        state.categories.push(customCategory(index));
    }
    assert.equal(Core.canCreateCategory(state, catalog), false);
    state.categories = state.categories.filter(category => category.id !== 'cinema');
    assert.equal(Core.canCreateCategory(state, catalog), false);
    state.categories = state.categories.filter(category => category.id !== 'personal-1');
    assert.equal(Core.canCreateCategory(state, catalog), true);
});

test('older categories over the creation cap and longer labels survive import while further creation stays disabled', () => {
    const original = { version: 2, categories: [...structuredClone(catalog.categories), ...Array.from({ length: 6 }, (_, index) => customCategory(index, { label: 'x'.repeat(80) }))] };
    const state = Core.parseImport(JSON.stringify(original), catalog);
    assert.equal(state.categories.length, 8);
    assert.equal(state.categories.at(-1).label.length, 80);
    assert.equal(Core.canCreateCategory(state, catalog), false);
    const saved = storage();
    assert.equal(Core.saveState(saved, state), true);
    assert.deepEqual(Core.loadState(saved, catalog).state.categories, state.categories);
    const full = Core.normalizeState({ version: 2, categories: Array.from({ length: 50 }, (_, index) => customCategory(index)) });
    assert.equal(Core.canCreateCategory(full, { categories: full.categories }), false);
    assert.throws(() => Core.normalizeState({ ...full, categories: [...full.categories, customCategory(50)] }), /50 catégories/);
});

test('the importer accepts copied portal share links and historical codes without changing strict Telegraph URL validation', () => {
    const code = 'EvPortal-09-10_2';
    for (const input of [
        code,
        'https://telegra.ph/' + code,
        'https://www.telegra.ph/' + code,
        'https://slid-an.github.io/EvPortal/?code=' + code,
        'https://ev.example.org/custom/path/index.html?config=' + code,
        'http://192.168.1.42:4187/?code=' + code,
        'https://ev.example.org/?source=phone&code=' + code,
        'https://ev.example.org/?code=EvPortal%2D09%2D10_2'
    ]) assert.equal(Core.telegraphImportPath(input), code, input);
    assert.equal(Core.telegraphImportPath(Telegraph.shareURL('https://ev.example.org/portal/', code)), code);
    assert.throws(() => Core.telegraphPath('https://ev.example.org/?code=' + code));
    assert.throws(() => Core.telegraphImportPath('https://telegra.ph/' + code + '?code=another'));
});

test('portal import links reject missing, duplicate, ambiguous or unsafe identifiers before any request', () => {
    for (const input of [
        'https://ev.example.org/',
        'https://ev.example.org/?code=',
        'https://ev.example.org/?Code=page',
        'https://ev.example.org/?code=first&code=second',
        'https://ev.example.org/?config=first&config=second',
        'https://ev.example.org/?code=same&config=same',
        'https://ev.example.org/?code=page&config=',
        'https://ev.example.org/?code=page#config=other',
        'https://user:secret@ev.example.org/?code=page',
        'https://user@ev.example.org/?code=page',
        'https://ev.example.org/?code=..%2Fsecret',
        'https://ev.example.org/?code=%252E%252E%252Fsecret',
        'https://ev.example.org/?code=%00page',
        'https://ev.example.org/?code=%20page',
        'https://ev.example.org/?code=page%0A',
        'https://ev.example.org/?code=' + 'a'.repeat(251),
        'https://ev.example.org/?code=https%3A%2F%2Ftelegra.ph%2Fnested',
        'https://ev.example.org/?code=https%3A%2F%2Fother.example.org%2Fpage',
        'https://ev.example.org/?code=javascript%3Aalert(1)',
        'javascript:alert(1)',
        'ftp://ev.example.org/?code=page',
        '//ev.example.org/?code=page',
        null,
        {}
    ]) assert.throws(() => Core.telegraphImportPath(input), undefined, String(input));
});
