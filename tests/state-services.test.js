'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/state.js');
const Telegraph = require('../js/telegraph.js');

const catalog = {
    version: 'canonical-test',
    categories: [
        { id: 'cinema', label: 'Cinéma', shortcuts: [
            { serviceId: 'canal-plus', name: 'CANAL+', url: 'https://www.canalplus.com/', categoryIds: ['cinema', 'tv'], countries: ['FR'] },
            { serviceId: 'pluto-tv', name: 'Pluto TV', url: 'https://pluto.tv/', categoryIds: ['cinema', 'tv'], legacyAliases: [
                { name: 'Pluto TV', url: 'https://pluto.tv/fr/' },
                { name: 'Pluto TV', url: 'https://pluto.tv/fr/watch/live-tv/' }
            ] }
        ] },
        { id: 'tv', label: 'Télévision', shortcuts: [
            { serviceId: 'gulli', name: 'Gulli', url: 'https://www.m6.fr/gulli/direct', categoryIds: ['tv'], legacyCategoryIds: ['cinema', 'tv'], countries: ['FR'] },
            { serviceId: 'tubitv', name: 'Tubi', url: 'https://tubitv.com/', categoryIds: ['tv'], countries: ['US', 'CA'] }
        ] },
        { id: 'charging', label: 'Recharge', shortcuts: [
            { serviceId: 'abrp', name: 'ABRP', url: 'https://abetterrouteplanner.com/', categoryIds: ['charging', 'navigation'] }
        ] },
        { id: 'navigation', label: 'Navigation', shortcuts: [] },
        { id: 'social', label: 'Réseaux sociaux', shortcuts: [
            { serviceId: 'mastodon', name: 'Mastodon', url: 'https://mastodon.social/', categoryIds: ['social'], defaultIncluded: false }
        ] }
    ],
    replacements: []
};

function storage(initial) {
    const values = new Map(Object.entries(initial || {}));
    return { getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)) };
}

function shortcut(id, name, url, patch) { return { id, name, url, ...patch }; }
function oldState() {
    return Core.normalizeState({ version: 2, categories: [
        { id: 'cinema', label: 'Cinéma', shortcuts: [
            shortcut('canal-cinema', 'CANAL+', 'https://www.canalplus.com/', { clickCount: 4 }),
            shortcut('pluto-cinema', 'Pluto TV', 'https://pluto.tv/fr/', { clickCount: 2 }),
            shortcut('gulli-cinema', 'Gulli', 'https://www.m6.fr/gulli/direct'),
            shortcut('personal-name', 'CANAL+ de famille', 'https://www.canalplus.com/'),
            shortcut('personal-url', 'CANAL+', 'https://www.canalplus.com/mon-compte')
        ] },
        { id: 'tv', label: 'Télévision', shortcuts: [
            shortcut('canal-tv', 'CANAL+', 'https://www.canalplus.com/', { clickCount: 7, favorite: true }),
            shortcut('pluto-tv', 'Pluto TV', 'https://pluto.tv/fr/watch/live-tv/', { clickCount: 3 })
        ] },
        { id: 'charging', label: 'Recharge', shortcuts: [shortcut('abrp-charge', 'ABRP', 'https://abetterrouteplanner.com/', { clickCount: Number.MAX_SAFE_INTEGER - 2 })] },
        { id: 'navigation', label: 'Navigation', shortcuts: [shortcut('abrp-nav', 'ABRP', 'https://abetterrouteplanner.com/', { clickCount: 4 })] },
        { id: 'personal', label: 'Mes outils', shortcuts: [shortcut('custom-copy', 'ABRP', 'https://abetterrouteplanner.com/')] }
    ] });
}

test('membership views share one physical shortcut, favorite, count and global ordering position', () => {
    const state = Core.fromCatalog(catalog);
    const abrp = Core.allShortcutEntries(state).find(entry => entry.shortcut.serviceId === 'abrp');
    const charging = Core.shortcutsForCategory(state, 'charging').find(entry => entry.shortcut.id === abrp.shortcut.id);
    const navigation = Core.shortcutsForCategory(state, 'navigation').find(entry => entry.shortcut.id === abrp.shortcut.id);
    assert.strictEqual(charging.shortcut, navigation.shortcut);
    assert.strictEqual(charging.category, navigation.category);
    assert.equal(navigation.category.id, 'charging');
    navigation.shortcut.favorite = true;
    assert.equal(Core.shortcutsForCategory(state, 'favorites').length, 1);
    const clicked = Core.recordShortcutClick(state, abrp.shortcut.id);
    assert.equal(Core.shortcutsForCategory(clicked, 'navigation')[0].shortcut.clickCount, 1);
    assert.equal(Core.allShortcutEntries(clicked).filter(entry => entry.shortcut.serviceId === 'abrp').length, 1);
    assert.equal(Core.rankShortcuts(clicked)[0].shortcut.id, abrp.shortcut.id);
    assert.equal(state.shortcutOrder.filter(id => id === abrp.shortcut.id).length, 1);
});

test('v2 imports infer old owner memberships and validate all explicit references before saving', () => {
    const initial = { version: 2, categories: [
        { id: 'cinema', label: 'Cinéma', shortcuts: [shortcut('one', 'Test', 'https://example.org/')] },
        { id: 'tv', label: 'TV', shortcuts: [] }
    ] };
    assert.deepEqual(Core.normalizeState(initial).categories[0].shortcuts[0].categoryIds, ['cinema']);
    const duplicate = structuredClone(initial);
    duplicate.categories[0].shortcuts[0].categoryIds = ['tv', 'tv'];
    assert.deepEqual(Core.normalizeState(duplicate).categories[0].shortcuts[0].categoryIds, ['cinema', 'tv']);
    for (const categoryIds of ['tv', null, {}, ['missing'], ['all'], ['favorites'], [true], Array(51).fill('tv')]) {
        const invalid = structuredClone(initial);
        invalid.categories[0].shortcuts[0].categoryIds = categoryIds;
        assert.throws(() => Core.normalizeState(invalid));
    }
    for (const serviceId of [null, '', '<script>', {}, 'x'.repeat(101)]) {
        const invalid = structuredClone(initial);
        invalid.categories[0].shortcuts[0].serviceId = serviceId;
        assert.throws(() => Core.normalizeState(invalid));
    }
    assert.equal(initial.categories[0].shortcuts[0].categoryIds, undefined);
});

test('canonical v2 identity and memberships survive JSON, local storage and Telegraph payloads', () => {
    let state = Core.fromCatalog(catalog, { market: 'FR' });
    const entry = Core.allShortcutEntries(state).find(entry => entry.shortcut.serviceId === 'abrp');
    state = Core.updateShortcut(state, entry.shortcut.id, { favorite: true, clickCount: 24 });
    assert.deepEqual(Core.parseImport(JSON.stringify(state), catalog), state);
    const saved = storage();
    assert.equal(Core.saveState(saved, state), true);
    assert.deepEqual(Core.loadState(saved, catalog, { market: 'US' }).state, state);
    const nodes = JSON.parse(Telegraph.contentForState(state));
    assert.deepEqual(Core.parseImport(nodes[0].children[0], catalog), state);
    assert.equal(state.market, undefined);
    assert.equal(state.hiddenCategoryIds, undefined);
});

test('duplicate explicit service identities reject imports and cannot overwrite a saved configuration', () => {
    const state = Core.fromCatalog(catalog);
    const saved = storage();
    assert.equal(Core.saveState(saved, state), true);
    const before = saved.getItem(Core.STORAGE_KEY);
    const duplicate = structuredClone(state);
    const abrp = Core.allShortcutEntries(duplicate).find(entry => entry.shortcut.serviceId === 'abrp').shortcut;
    duplicate.categories.find(category => category.id === 'navigation').shortcuts.push({
        ...abrp, id: 'separate-id-same-service', categoryIds: ['navigation']
    });
    assert.throws(() => Core.normalizeState(duplicate), /même identifiant/i);
    assert.throws(() => Core.parseImport(JSON.stringify(duplicate), catalog), /même identifiant/i);
    assert.equal(Core.saveState(saved, duplicate), false);
    assert.equal(saved.getItem(Core.STORAGE_KEY), before);
    assert.deepEqual(Core.loadState(saved, catalog).state, state);
    const legacy = oldState();
    assert.doesNotThrow(() => Core.normalizeState(legacy));
    const migrated = Core.applyCatalogUpdates(legacy, catalog).state;
    const identities = Core.allShortcutEntries(migrated).map(entry => entry.shortcut.serviceId).filter(Boolean);
    assert.equal(new Set(identities).size, identities.length);
});

test('foreign local preferences are excluded from JSON and Telegraph state exports', () => {
    const source = { ...Core.fromCatalog(catalog), market: 'US', hiddenCategoryIds: ['tv'], homeFavorites: true, language: 'ru', shortcutSize: 'small', showShortcutNames: false };
    const normalized = Core.normalizeState(source);
    for (const key of ['market', 'hiddenCategoryIds', 'homeFavorites', 'language', 'shortcutSize', 'showShortcutNames']) assert.equal(Object.hasOwn(normalized, key), false);
    const json = Core.parseImport(JSON.stringify(source), catalog);
    const nodes = JSON.parse(Telegraph.contentForState(source));
    assert.deepEqual(json, normalized);
    assert.deepEqual(JSON.parse(nodes[0].children[0]), normalized);
});

test('initial catalogue is global even with legacy country options, while optional entries remain opt-in', () => {
    const all = Core.fromCatalog(catalog);
    const ids = state => Core.allShortcutEntries(state).map(entry => entry.shortcut.serviceId);
    const expected = ['canal-plus', 'pluto-tv', 'gulli', 'tubitv', 'abrp'];
    assert.deepEqual(ids(all), expected);
    for (const market of ['ALL', 'FR', 'CA', 'US', 'BE', 'GB', 'AU', 'unknown', undefined]) {
        const initial = Core.fromCatalog(catalog, { market });
        assert.deepEqual(ids(initial), expected, String(market));
        assert.deepEqual(Core.catalogServices(catalog, { market }), Core.catalogServices(catalog));
        assert.deepEqual(ids(Core.loadState(storage(), catalog, { market }).state), expected);
        assert.equal(initial.categories.find(category => category.id === 'navigation').shortcuts.length, 0);
        assert.equal(Core.shortcutsForCategory(initial, 'navigation').length, 1);
    }
    assert.equal(all.categories.some(category => category.id === 'social'), false);
    assert.equal(Core.catalogServices(catalog, { market: 'FR' }).some(entry => entry.shortcut.serviceId === 'mastodon'), true);
    assert.equal(Core.catalogServices(catalog, { market: 'FR', includeOptional: false }).some(entry => entry.shortcut.serviceId === 'mastodon'), false);
    assert.equal(Core.loadState(storage(), catalog, { market: 'US' }).state.categories.some(category => category.id === 'social'), false);
});

test('global catalogue changes preserve installed services and never reinsert deleted links or categories', () => {
    let state = Core.fromCatalog(catalog, { market: 'FR' });
    state = Core.addCatalogService(state, catalog, 'mastodon');
    const gulli = Core.allShortcutEntries(state).find(entry => entry.shortcut.serviceId === 'gulli');
    state = Core.removeShortcut(state, gulli.shortcut.id);
    const abrp = Core.allShortcutEntries(state).find(entry => entry.shortcut.serviceId === 'abrp');
    state = Core.updateShortcut(state, abrp.shortcut.id, { name: 'Mes étapes', favorite: true, clickCount: 17 });
    const saved = storage();
    Core.saveState(saved, state);
    assert.deepEqual(Core.loadState(saved, catalog, { market: 'US' }).state, state);
    assert.equal(Core.allShortcutEntries(Core.applyCatalogUpdates(state, catalog).state).some(entry => entry.shortcut.serviceId === 'gulli'), false);
    const empty = Core.normalizeState({ version: 2, categories: [] });
    assert.deepEqual(Core.applyCatalogUpdates(empty, catalog).state.categories, []);
});

test('explicit catalogue addition installs one service and only its missing category shells', () => {
    const initial = Core.normalizeState({ version: 2, categories: [] });
    const added = Core.addCatalogService(initial, catalog, 'abrp');
    assert.deepEqual(added.categories.map(category => category.id), ['charging', 'navigation']);
    assert.equal(Core.allShortcutEntries(added).length, 1);
    assert.deepEqual(Core.addCatalogService(added, catalog, 'abrp'), added);
    assert.equal(Core.shortcutsForCategory(added, 'navigation').length, 1);
    assert.deepEqual(initial.categories, []);
    assert.throws(() => Core.addCatalogService(initial, catalog, 'missing'));
});

test('editing memberships rehomes canonical ownership and preserves count, favorite and manual order', () => {
    const initial = Core.fromCatalog(catalog);
    const abrp = Core.allShortcutEntries(initial).find(entry => entry.shortcut.serviceId === 'abrp').shortcut;
    const next = Core.updateShortcut(initial, abrp.id, { name: 'Mon trajet', categoryIds: ['navigation'], favorite: true, clickCount: 12 });
    const entry = Core.getShortcutEntry(next, abrp.id);
    assert.equal(entry.category.id, 'navigation');
    assert.deepEqual(entry.shortcut.categoryIds, ['navigation']);
    assert.equal(entry.shortcut.serviceId, 'abrp');
    assert.equal(Core.shortcutsForCategory(next, 'charging').length, 0);
    assert.deepEqual(next.shortcutOrder, initial.shortcutOrder);
    assert.equal(Core.getShortcutEntry(initial, abrp.id).shortcut.name, 'ABRP');
    const explicit = Core.updateShortcut(initial, abrp.id, { categoryIds: ['charging', 'navigation'] }, 'navigation');
    assert.equal(Core.getShortcutEntry(explicit, abrp.id).category.id, 'navigation');
    assert.throws(() => Core.updateShortcut(initial, abrp.id, { categoryIds: [] }));
    assert.throws(() => Core.updateShortcut(initial, abrp.id, { id: 'changed-id' }));
    assert.throws(() => Core.updateShortcut(initial, abrp.id, { categoryIds: ['navigation'] }, 'tv'));
});

test('deleting a category rehomes shared services and removes only orphaned shortcuts', () => {
    let state = Core.fromCatalog(catalog, { market: 'FR' });
    const abrp = Core.allShortcutEntries(state).find(entry => entry.shortcut.serviceId === 'abrp').shortcut;
    state = Core.updateShortcut(state, abrp.id, { favorite: true, clickCount: 9 });
    state.activeCategory = 'charging';
    const next = Core.removeCategory(state, 'charging');
    assert.equal(next.activeCategory, 'all');
    assert.equal(Core.getShortcutEntry(next, abrp.id).category.id, 'navigation');
    assert.equal(Core.getShortcutEntry(next, abrp.id).shortcut.clickCount, 9);
    assert.equal(Core.getShortcutEntry(next, abrp.id).shortcut.favorite, true);
    assert.deepEqual(Core.getShortcutEntry(next, abrp.id).shortcut.categoryIds, ['navigation']);
    assert.equal(Core.getShortcutEntry(Core.removeCategory(next, 'navigation'), abrp.id), null);
    const removed = Core.removeShortcut(state, abrp.id);
    assert.equal(Core.shortcutsForCategory(removed, 'charging').length, 0);
    assert.equal(Core.shortcutsForCategory(removed, 'navigation').length, 0);
    assert.equal(removed.shortcutOrder.includes(abrp.id), false);
});

test('changing a service URL creates a personal destination and permits adding the official service again', () => {
    const initial = Core.fromCatalog(catalog);
    const abrp = Core.allShortcutEntries(initial).find(entry => entry.shortcut.serviceId === 'abrp').shortcut;
    const renamed = Core.updateShortcut(initial, abrp.id, { name: 'Mes trajets', url: 'https://ABETTERROUTEPLANNER.com' });
    assert.equal(Core.getShortcutEntry(renamed, abrp.id).shortcut.serviceId, 'abrp');
    const edited = Core.updateShortcut(initial, abrp.id, { name: 'Mon serveur', url: 'https://personal.example.org/', favorite: true, clickCount: 9 });
    assert.equal(Core.getShortcutEntry(edited, abrp.id).shortcut.serviceId, undefined);
    const added = Core.addCatalogService(edited, catalog, 'abrp');
    assert.equal(Core.allShortcutEntries(added).filter(entry => entry.shortcut.serviceId === 'abrp').length, 1);
    assert.equal(Core.getShortcutEntry(added, abrp.id).shortcut.url, 'https://personal.example.org/');
    assert.equal(Core.getShortcutEntry(added, abrp.id).shortcut.favorite, true);
    assert.equal(Core.getShortcutEntry(added, abrp.id).shortcut.clickCount, 9);
    assert.equal(Core.allShortcutEntries(added).length, Core.allShortcutEntries(initial).length + 1);
    assert.deepEqual(Core.applyCatalogUpdates(added, catalog).state, added);
});

test('known legacy duplicates merge once with combined favorites and saturated counts; custom services stay intact', () => {
    const initial = oldState();
    const before = JSON.stringify(initial);
    const result = Core.applyCatalogUpdates(initial, catalog);
    const rows = Core.allShortcutEntries(result.state);
    for (const serviceId of ['canal-plus', 'pluto-tv', 'abrp']) assert.equal(rows.filter(row => row.shortcut.serviceId === serviceId).length, 1);
    const canal = rows.find(row => row.shortcut.serviceId === 'canal-plus').shortcut;
    assert.equal(canal.id, 'canal-cinema');
    assert.equal(canal.clickCount, 11);
    assert.equal(canal.favorite, true);
    assert.deepEqual(canal.categoryIds, ['cinema', 'tv']);
    assert.equal(rows.find(row => row.shortcut.serviceId === 'abrp').shortcut.clickCount, Number.MAX_SAFE_INTEGER);
    assert.equal(rows.find(row => row.shortcut.serviceId === 'pluto-tv').shortcut.url, 'https://pluto.tv/');
    assert.equal(rows.find(row => row.shortcut.serviceId === 'pluto-tv').shortcut.clickCount, 5);
    assert.equal(rows.find(row => row.shortcut.serviceId === 'gulli').category.id, 'tv');
    assert.deepEqual(rows.find(row => row.shortcut.serviceId === 'gulli').shortcut.categoryIds, ['tv']);
    for (const id of ['personal-name', 'personal-url', 'custom-copy']) {
        assert.deepEqual(Core.getShortcutEntry(result.state, id).shortcut, Core.getShortcutEntry(initial, id).shortcut);
    }
    assert.deepEqual(result.state.shortcutOrder, initial.shortcutOrder.filter(id => !['canal-tv', 'pluto-tv', 'abrp-nav'].includes(id)));
    assert.equal(JSON.stringify(initial), before);
    const second = Core.applyCatalogUpdates(result.state, catalog);
    assert.deepEqual(second.state, result.state);
    assert.equal(second.updates, 0);
});

test('migration never restores deleted categories or reverses later membership edits', () => {
    let state = oldState();
    state = Core.removeCategory(state, 'tv');
    const migrated = Core.applyCatalogUpdates(state, catalog).state;
    assert.equal(migrated.categories.some(category => category.id === 'tv'), false);
    assert.equal(Core.getShortcutEntry(migrated, 'gulli-cinema').category.id, 'cinema');
    const abrp = Core.allShortcutEntries(migrated).find(entry => entry.shortcut.serviceId === 'abrp').shortcut;
    const custom = Core.updateShortcut(migrated, abrp.id, { categoryIds: ['navigation'] });
    assert.deepEqual(Core.applyCatalogUpdates(custom, catalog).state, custom);
});

test('migration never assigns an occupied catalogue identity to a legacy-looking personal shortcut', () => {
    const initial = Core.fromCatalog(catalog);
    const abrp = Core.allShortcutEntries(initial).find(entry => entry.shortcut.serviceId === 'abrp').shortcut;
    const renamed = Core.updateShortcut(initial, abrp.id, { name: 'Mes trajets favoris' });
    const mixed = Core.addShortcut(renamed, 'navigation', shortcut('legacy-abrp', 'ABRP', 'https://abetterrouteplanner.com/'));
    const result = Core.applyCatalogUpdates(mixed, catalog);
    assert.deepEqual(result.state, mixed);
    assert.equal(result.updates, 0);
    assert.equal(Core.getShortcutEntry(result.state, 'legacy-abrp').shortcut.serviceId, undefined);
    assert.equal(Core.getShortcutEntry(result.state, abrp.id).shortcut.name, 'Mes trajets favoris');
});
