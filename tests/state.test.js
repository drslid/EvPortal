'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/state.js');
const catalog = {
    version: '2026-09',
    categories: [
        { id: 'cinema', label: 'Cinéma', description: 'Films et séries', shortcuts: [
            { name: 'Écran', url: 'https://video.example/new', description: 'Cinéma français', tag: 'Vidéo', color: '#123456' },
            { name: 'Nouveauté', url: 'https://new.example/', description: 'Un nouveau service' }
        ] },
        { id: 'charging', label: 'Recharge', description: 'Trouver une borne', shortcuts: [
            { name: 'Carte', url: 'https://maps.example/', description: 'Préparer une étape' }
        ] }
    ],
    replacements: [{ from: 'https://video.example/old', to: 'https://video.example/new', name: 'Écran' }]
};
function fakeStorage(initial) {
    const values = new Map(Object.entries(initial || {}));
    return {
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(key, String(value)); },
        values
    };
}

test('global tile order is optional in old v2 backups and survives saving and import', () => {
    const initial = Core.fromCatalog(catalog);
    delete initial.shortcutOrder;
    const old = Core.normalizeState(initial);
    assert.deepEqual(old.shortcutOrder, old.categories.flatMap(category => category.shortcuts.map(item => item.id)));
    const next = Core.reorderShortcuts(old, old.shortcutOrder.slice().reverse());
    const storage = fakeStorage();
    assert.equal(Core.saveState(storage, next), true);
    assert.deepEqual(Core.loadState(storage, catalog).state.shortcutOrder, next.shortcutOrder);
    assert.deepEqual(Core.parseImport(JSON.stringify(next), catalog).shortcutOrder, next.shortcutOrder);
});

test('moving mixed-category favorites keeps hidden tiles and category memberships intact', () => {
    const state = Core.fromCatalog(catalog);
    const [first, hidden, last] = state.shortcutOrder;
    const next = Core.reorderShortcuts(state, [last, first]);
    assert.deepEqual(next.shortcutOrder, [last, hidden, first]);
    assert.deepEqual(next.categories.map(category => category.shortcuts.map(item => item.id).sort()), state.categories.map(category => category.shortcuts.map(item => item.id).sort()));
    assert.deepEqual(state.shortcutOrder, [first, hidden, last]);
    assert.deepEqual(next.categories[0].shortcuts.map(item => item.id), [hidden, first]);
    assert.throws(() => Core.reorderShortcuts(state, [first, first]), /Déplacement/);
    assert.throws(() => Core.reorderShortcuts(state, ['missing']), /Déplacement/);
});

test('deleted tiles leave no stale ordering entries and new tiles are appended', () => {
    const state = Core.fromCatalog(catalog);
    const deleted = state.categories[0].shortcuts.shift().id;
    state.categories[0].shortcuts.push({ id: 'new-personal', name: 'Nouveau', url: 'https://example.org/' });
    const next = Core.normalizeState(state);
    assert.equal(next.shortcutOrder.includes(deleted), false);
    assert.equal(next.shortcutOrder.at(-1), 'new-personal');
    assert.equal(next.shortcutOrder.length, 3);
    assert.throws(() => Core.normalizeState({ ...next, shortcutOrder: [next.shortcutOrder[0], next.shortcutOrder[0]] }), /Ordre/);
});

test('default state copies the catalogue with unique IDs and the cinema initial category', () => {
    const state = Core.fromCatalog(catalog);
    assert.equal(state.version, 2);
    assert.equal(state.activeCategory, 'cinema');
    assert.equal(new Set(state.categories.flatMap(category => category.shortcuts.map(item => item.id))).size, 3);
    state.categories[0].shortcuts[0].name = 'Personnel';
    assert.equal(catalog.categories[0].shortcuts[0].name, 'Écran');
});

test('URLs allow only absolute HTTP(S) without credentials or control characters', () => {
    assert.equal(Core.normalizeURL('https://EXAMPLE.org'), 'https://example.org/');
    assert.equal(Core.normalizeURL('http://example.org/path?q=yes'), 'http://example.org/path?q=yes');
    for (const value of ['javascript:alert(1)', 'data:text/html,test', '//example.org', '/relative', 'ftp://example.org', 'https://user:secret@example.org', 'https://user@example.org', 'https://example.org/a b', 'https://exa\nmple.org', '', null]) {
        assert.throws(() => Core.normalizeURL(value));
    }
});

test('version 2 export/import preserves order, favorites, theme and labels safely', () => {
    const state = Core.fromCatalog(catalog);
    state.theme = 'dark';
    state.activeCategory = 'favorites';
    state.categories[0].shortcuts[1].favorite = true;
    state.categories[0].label = '<img src=x onerror=alert(1)> # [été]';
    state.categories[0].shortcuts.reverse();
    const next = Core.parseImport(JSON.stringify(state), catalog);
    assert.deepEqual(next, state);
    assert.notEqual(next.categories, state.categories);
});

test('legacy export containing pages metadata preserves category and stable link order', () => {
    const legacy = { pages: ['cinema', 'Été # [amis]'], cinema: [
        { name: 'Après', url: 'https://after.example/', order: '2' },
        { name: 'Avant', url: 'https://before.example/', order: 1 },
        { name: 'Même ordre', url: 'https://tie.example/', order: 2 }
    ], 'Été # [amis]': [] };
    const state = Core.parseImport(JSON.stringify(legacy), catalog);
    assert.equal(state.categories.length, 2);
    assert.equal(state.categories[0].label, 'Cinéma');
    assert.equal(state.categories[1].label, 'Été # [amis]');
    assert.match(state.categories[1].id, /^category-[a-zA-Z0-9-]+$/);
    assert.deepEqual(state.categories[0].shortcuts.map(item => item.name), ['Avant', 'Après', 'Même ordre']);
});

test('legacy dictionary imports support empty categories and harmless prototype-like names', () => {
    const state = Core.parseImport('{"__proto__":[{"name":"Test","url":"https://example.org"}],"empty":[]}', catalog);
    assert.equal(state.categories[0].label, '__proto__');
    assert.equal(state.categories[1].shortcuts.length, 0);
    assert.equal({}.polluted, undefined);
});

test('invalid imports are rejected as a whole and cannot mutate current data', () => {
    const state = Core.fromCatalog(catalog);
    const snapshot = JSON.stringify(state);
    const invalid = [
        'not JSON', 'null', '[]', '{"pages":["cinema"]}',
        '{"pages":["cinema","cinema"],"cinema":[]}',
        '{"pages":["cinema"],"cinema":[],"unrelated":[]}',
        '{"cinema":[{"name":"Broken","url":"javascript:alert(1)"}]}',
        '{"cinema":[{"name":"Broken","url":"https://example.org","order":false}]}',
        '{"version":3,"categories":[]}',
        JSON.stringify({ ...state, activeCategory: 'missing' }),
        JSON.stringify({ ...state, theme: 'script' }),
        JSON.stringify({ ...state, categories: [{ ...state.categories[0], id: 'bad # [selector]' }] }),
        JSON.stringify({ ...state, categories: [{ ...state.categories[0], id: 'all' }] }),
        JSON.stringify({ ...state, categories: [state.categories[0], state.categories[0]] }),
        JSON.stringify({ ...state, categories: [{ ...state.categories[0], shortcuts: [state.categories[0].shortcuts[0], state.categories[0].shortcuts[0]] }] })
    ];
    for (const input of invalid) assert.throws(() => Core.parseImport(input, catalog), undefined, input);
    assert.equal(JSON.stringify(state), snapshot);
});

test('import validation rejects invalid types, CSS colors, excessive length and file size', () => {
    const state = Core.fromCatalog(catalog);
    for (const patch of [{ favorite: 'true' }, { color: 'url(https://tracker.example)' }, { name: 'a'.repeat(101) }, { description: 'a'.repeat(301) }, { tag: 123 }]) {
        const next = structuredClone(state);
        Object.assign(next.categories[0].shortcuts[0], patch);
        assert.throws(() => Core.parseImport(JSON.stringify(next), catalog));
    }
    assert.throws(() => Core.parseImport(' '.repeat(Core.MAX_FILE_BYTES + 1), catalog), /2 Mo/);
    assert.throws(() => Core.normalizeState({ version: 2, categories: Array.from({ length: 51 }, () => ({ label: 'x', shortcuts: [] })) }), /50 catégories/);
});

test('legacy local storage migration leaves all original and unrelated keys intact', () => {
    const original = {
        pages: '["cinema"]',
        cinema: '[{"name":"Mon écran personnalisé","url":"https://video.example/old","order":1}]',
        'other-app': '{"personal":"untouched"}',
        config: '{"accesstoken":"private"}'
    };
    const storage = fakeStorage(original);
    const result = Core.loadState(storage, catalog);
    assert.equal(result.source, 'legacy');
    assert.equal(result.updates, 1);
    assert.equal(result.state.categories[0].shortcuts[0].url, 'https://video.example/new');
    assert.equal(result.state.categories[0].shortcuts[0].name, 'Mon écran personnalisé');
    assert.equal(result.state.categories[0].shortcuts.length, 1);
    assert.equal(result.state.categories.length, 1);
    assert.equal(Core.saveState(storage, result.state), true);
    for (const [key, value] of Object.entries(original)) assert.equal(storage.getItem(key), value);
    assert.equal(Core.loadState(storage, catalog).source, 'saved');
});

test('catalogue updates never recreate intentionally deleted links or categories', () => {
    const state = Core.fromCatalog(catalog);
    state.categories = [state.categories[0]];
    state.categories[0].shortcuts = [];
    const result = Core.applyCatalogUpdates(state, catalog);
    assert.equal(result.state.categories.length, 1);
    assert.equal(result.state.categories[0].shortcuts.length, 0);
    assert.equal(result.updates, 0);
});

test('exact replacement ignores unrelated paths and preserves custom names', () => {
    const state = Core.fromLegacy({ cinema: [
        { name: 'My link', url: 'https://video.example/old' },
        { name: 'My other link', url: 'https://video.example/old?custom=true' }
    ] }, catalog);
    const result = Core.applyCatalogUpdates(state, catalog);
    assert.equal(result.updates, 1);
    assert.equal(result.state.categories[0].shortcuts[0].name, 'My link');
    assert.equal(result.state.categories[0].shortcuts[1].url, 'https://video.example/old?custom=true');
    assert.equal(state.categories[0].shortcuts[0].url, 'https://video.example/old');
});

test('known obsolete default names are updated, while renamed personal links stay named', () => {
    const nextCatalog = structuredClone(catalog);
    nextCatalog.replacements[0].legacyName = 'Ancien Écran';
    const state = Core.fromLegacy({ cinema: [
        { name: 'Ancien Écran', url: 'https://video.example/old' },
        { name: 'Mon écran', url: 'https://video.example/old' }
    ] }, nextCatalog);
    const next = Core.applyCatalogUpdates(state, nextCatalog).state;
    assert.equal(next.categories[0].shortcuts[0].name, 'Écran');
    assert.equal(next.categories[0].shortcuts[1].name, 'Mon écran');
});

test('legacy links inherit catalogue metadata only for fields not previously customized', () => {
    const state = Core.fromLegacy({ cinema: [
        { name: 'Default', url: 'https://video.example/old' },
        { name: 'Personal', url: 'https://video.example/new', description: '', color: '#abcdef', tag: 'À moi' }
    ] }, catalog);
    assert.equal(state.categories[0].shortcuts[0].description, 'Cinéma français');
    assert.equal(state.categories[0].shortcuts[0].color, '#123456');
    assert.equal(state.categories[0].shortcuts[0].tag, 'Vidéo');
    assert.equal(state.categories[0].shortcuts[1].description, '');
    assert.equal(state.categories[0].shortcuts[1].color, '#abcdef');
    assert.equal(state.categories[0].shortcuts[1].tag, 'À moi');
});

test('corrupt or unavailable storage preserves originals and starts a temporary usable session', () => {
    for (const initial of [{ [Core.STORAGE_KEY]: '{broken' }, { pages: '{broken' }, { pages: '["cinema"]', cinema: '{broken' }]) {
        const storage = fakeStorage(initial);
        const result = Core.loadState(storage, catalog);
        assert.equal(result.locked, true);
        assert.equal(result.source, 'recovery');
        assert.ok(result.state.categories.length);
        for (const [key, value] of Object.entries(initial)) assert.equal(storage.getItem(key), value);
    }
    const throwing = { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Quota'); } };
    assert.equal(Core.loadState(throwing, catalog).locked, true);
    assert.equal(Core.saveState(throwing, Core.fromCatalog(catalog)), false);
    assert.equal(Core.loadState(null, catalog).locked, true);
});

test('saving invalid state never changes an existing persisted configuration', () => {
    const storage = fakeStorage({ [Core.STORAGE_KEY]: 'original' });
    const state = Core.fromCatalog(catalog);
    state.categories[0].shortcuts[0].url = 'javascript:alert(1)';
    assert.equal(Core.saveState(storage, state), false);
    assert.equal(storage.getItem(Core.STORAGE_KEY), 'original');
});

test('an intentionally empty portal stays empty on reload and import', () => {
    const storage = fakeStorage({ pages: '[]' });
    const loaded = Core.loadState(storage, catalog);
    assert.equal(loaded.state.categories.length, 0);
    assert.equal(Core.saveState(storage, loaded.state), true);
    assert.equal(Core.loadState(storage, catalog).state.categories.length, 0);
    assert.equal(Core.parseImport('{"version":2,"categories":[]}', catalog).categories.length, 0);
});

test('search is global-ready, accent/case insensitive and matches all query words', () => {
    const category = catalog.categories[0];
    const shortcut = category.shortcuts[0];
    assert.equal(Core.matches(shortcut, category, 'eCRan FRANCAIS'), true);
    assert.equal(Core.matches(shortcut, category, 'video.example'), true);
    assert.equal(Core.matches(shortcut, category, 'cinema'), true);
    assert.equal(Core.matches(shortcut, category, 'video inexistant'), false);
    assert.equal(Core.matches(shortcut, category, ''), true);
});

test('reordering by identity is stable for equal names and does not mutate the input', () => {
    const rows = [{ id: 'one', name: 'Same' }, { id: 'two', name: 'Same' }, { id: 'three', name: 'Other' }];
    assert.deepEqual(Core.move(rows, 'one', 2).map(item => item.id), ['two', 'three', 'one']);
    assert.deepEqual(Core.move(rows, 'three', -2).map(item => item.id), ['three', 'one', 'two']);
    assert.deepEqual(Core.move(rows, 'one', -1), rows);
    assert.deepEqual(Core.move(rows, 'missing', 1), rows);
    assert.deepEqual(rows.map(item => item.id), ['one', 'two', 'three']);
});

test('historical sharing identifiers accept only Telegraph page IDs or Telegraph URLs', () => {
    assert.equal(Core.telegraphPath('EvPortal-2026-09-10'), 'EvPortal-2026-09-10');
    assert.equal(Core.telegraphPath('https://telegra.ph/EvPortal-09-10'), 'EvPortal-09-10');
    for (const input of ['https://attacker.example/hello', 'https://telegra.ph/hello?query=1', '../hello', 'hello/../../path', 'javascript:alert(1)', 'https://user:password@telegra.ph/test']) assert.throws(() => Core.telegraphPath(input));
});
