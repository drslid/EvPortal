'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Preferences = require('../js/preferences.js');
const defaults = { homeFavorites: false, hiddenCategoryIds: [], shortcutSize: 'standard', showShortcutNames: true };

function storage(initial = {}) {
    const values = new Map(Object.entries(initial));
    const writes = [];
    return { values, writes, getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => { writes.push(key); values.set(key, String(value)); } };
}

test('browser locale has no effect on the available device preferences', () => {
    for (const locale of ['fr-CA', 'en-GB', 'es-MX', 'fr_CH', 'de-DE', 'en', 'fr', 'pt-BR', 'ar-SA', 'bad locale', null]) {
        const saved = storage();
        assert.deepEqual(Preferences.createPreferences(saved, { locale }).read(), defaults);
        assert.equal(saved.writes.length, 0, 'Starting the app does not create or rewrite preferences');
    }
});

test('device favorites and category visibility survive reload independently of interface language and shared state', () => {
    const saved = storage({ 'evportal.state.v2': 'portable configuration', 'evportal.language.v1': 'fr', config: 'legacy account' });
    const api = Preferences.createPreferences(saved, { locale: 'fr-FR' });
    api.patch({ homeFavorites: true, hiddenCategoryIds: ['news', 'music'], shortcutSize: 'small', showShortcutNames: false });
    assert.deepEqual(Preferences.createPreferences(saved, { locale: 'de-DE' }).read(), { homeFavorites: true, hiddenCategoryIds: ['news', 'music'], shortcutSize: 'small', showShortcutNames: false });
    assert.deepEqual(saved.writes, [Preferences.STORAGE_KEY]);
    assert.equal(saved.getItem('evportal.state.v2'), 'portable configuration');
    assert.equal(saved.getItem('evportal.language.v1'), 'fr');
    assert.equal(saved.getItem('config'), 'legacy account');
});

test('a partial update preserves inactive legacy country and unknown stored fields without accepting unrelated patch data', () => {
    const saved = storage({ [Preferences.STORAGE_KEY]: JSON.stringify({ version: 1, homeFavorites: true, market: 'CA', hiddenCategoryIds: ['news'], futureOption: { enabled: true } }) });
    const api = Preferences.createPreferences(saved, { locale: 'en-US' });
    assert.equal(api.read().shortcutSize, 'standard');
    assert.equal(api.read().showShortcutNames, true);
    api.patch({ hiddenCategoryIds: ['news', 'music'], market: 'BE', access_token: 'unrelated patch field' });
    const record = JSON.parse(saved.getItem(Preferences.STORAGE_KEY));
    assert.deepEqual(record.futureOption, { enabled: true });
    assert.equal(record.homeFavorites, true);
    assert.deepEqual(record.hiddenCategoryIds, ['news', 'music']);
    assert.equal(record.market, 'CA', 'An inactive legacy field remains available for recovery');
    assert.equal(record.access_token, undefined);
    assert.equal(Object.hasOwn(api.read(), 'market'), false);
});

test('legacy country values are inert and never invalidate otherwise usable device preferences', () => {
    for (const market of ['ALL', 'FR', 'CA', 'US', 'unknown', null, { legacy: true }]) {
        const raw = JSON.stringify({ version: 1, market, homeFavorites: true, hiddenCategoryIds: ['news'] });
        const saved = storage({ [Preferences.STORAGE_KEY]: raw });
        const api = Preferences.createPreferences(saved, { locale: 'ar-SA' });
        assert.deepEqual(api.read(), { ...defaults, homeFavorites: true, hiddenCategoryIds: ['news'] });
        assert.equal(api.persistent, true);
        assert.equal(saved.getItem(Preferences.STORAGE_KEY), raw, 'Reading never rewrites the historical record');
    }
    const saved = storage();
    Preferences.createPreferences(saved).patch({ market: 'FR', homeFavorites: true });
    assert.equal(Object.hasOwn(JSON.parse(saved.getItem(Preferences.STORAGE_KEY)), 'market'), false, 'New records never acquire a country');
});

test('invalid changes are rejected atomically without changing memory or storage', () => {
    const saved = storage();
    const api = Preferences.createPreferences(saved, { locale: 'en-GB' });
    const initial = api.read();
    for (const patch of [null, [], { homeFavorites: 'true' }, { hiddenCategoryIds: 'news' }, { hiddenCategoryIds: ['favorites'] }, { hiddenCategoryIds: ['all'] }, { hiddenCategoryIds: ['../bad'] }, { hiddenCategoryIds: Array(51).fill('news') }, { shortcutSize: 'large' }, { shortcutSize: null }, { showShortcutNames: 'false' }, { shortcutSize: 'small', showShortcutNames: 0 }]) {
        assert.throws(() => api.patch(patch), error => error.code === 'INVALID_PREFERENCES');
        assert.deepEqual(api.read(), initial);
    }
    assert.equal(saved.writes.length, 0);
});

test('read and patch results cannot mutate stored preferences and duplicate category IDs are removed', () => {
    const api = Preferences.createPreferences(storage(), { locale: 'fr-FR' });
    const input = ['news', 'news'];
    const output = api.patch({ hiddenCategoryIds: input });
    input.push('music');
    output.hiddenCategoryIds.push('games');
    api.read().hiddenCategoryIds.push('social');
    assert.deepEqual(api.read().hiddenCategoryIds, ['news']);
});

test('corrupt and future preference records remain intact while session changes still work', () => {
    for (const raw of ['broken JSON', 'null', JSON.stringify({ version: 2, market: 'CA' }), JSON.stringify({ version: 1, homeFavorites: 'yes' }), JSON.stringify({ version: 1, shortcutSize: 'large' }), JSON.stringify({ version: 1, showShortcutNames: 'false' })]) {
        const saved = storage({ [Preferences.STORAGE_KEY]: raw });
        const api = Preferences.createPreferences(saved, { locale: 'fr-FR' });
        assert.equal(api.persistent, false);
        assert.deepEqual(api.read(), defaults);
        api.patch({ homeFavorites: true, shortcutSize: 'small', showShortcutNames: false });
        assert.equal(api.read().homeFavorites, true);
        assert.equal(api.read().shortcutSize, 'small');
        assert.equal(api.read().showShortcutNames, false);
        assert.equal(saved.getItem(Preferences.STORAGE_KEY), raw);
        assert.equal(saved.writes.length, 0);
    }
});

test('blocked or full storage keeps temporary preferences and a later successful save recovers persistence', () => {
    const blocked = Preferences.createPreferences({ getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Blocked'); } }, { locale: 'en-US' });
    assert.equal(blocked.patch({ homeFavorites: true }).homeFavorites, true);
    assert.equal(blocked.persistent, false);
    const saved = storage();
    const write = saved.setItem;
    saved.setItem = () => { throw new Error('Quota exceeded'); };
    const api = Preferences.createPreferences(saved, { locale: 'en-US' });
    api.patch({ homeFavorites: true, shortcutSize: 'small', showShortcutNames: false });
    assert.equal(api.read().homeFavorites, true);
    assert.equal(api.persistent, false);
    saved.setItem = write;
    api.patch({ hiddenCategoryIds: ['news'] });
    assert.equal(api.persistent, true);
    assert.equal(Preferences.createPreferences(saved).read().homeFavorites, true);
    assert.equal(Preferences.createPreferences(saved).read().shortcutSize, 'small');
    assert.equal(Preferences.createPreferences(saved).read().showShortcutNames, false);
    const temporary = Preferences.createPreferences(null, { locale: 'en-US' });
    assert.equal(temporary.patch({ homeFavorites: true }).homeFavorites, true);
    assert.equal(temporary.persistent, false);
});
