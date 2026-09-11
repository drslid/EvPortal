'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Preferences = require('../js/preferences.js');

function storage(initial = {}) {
    const values = new Map(Object.entries(initial));
    const writes = [];
    return { values, writes, getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => { writes.push(key); values.set(key, String(value)); } };
}

test('an explicit browser region suggests the market without assuming a country from a language', () => {
    for (const [locale, expected] of [['fr-CA', 'CA'], ['en-GB', 'GB'], ['es-MX', 'MX'], ['fr_CH', 'CH'], ['de-DE', 'DE'], ['en', 'ALL'], ['fr', 'ALL'], ['pt-BR', 'ALL'], ['ar-SA', 'ALL'], ['bad locale', 'ALL'], [null, 'ALL']]) {
        assert.equal(Preferences.suggestMarket(locale), expected, String(locale));
    }
    const saved = storage();
    assert.deepEqual(Preferences.createPreferences(saved, { locale: 'fr-CA' }).read(), { homeFavorites: false, market: 'CA', hiddenCategoryIds: [] });
    assert.equal(saved.writes.length, 0, 'Starting the app does not create or rewrite preferences');
});

test('explicit worldwide selection and device favorites survive reload independently of interface language and shared state', () => {
    const saved = storage({ 'evportal.state.v2': 'portable configuration', 'evportal.language.v1': 'fr', config: 'legacy account' });
    const api = Preferences.createPreferences(saved, { locale: 'fr-FR' });
    api.patch({ homeFavorites: true, market: 'ALL', hiddenCategoryIds: ['news', 'music'] });
    assert.deepEqual(Preferences.createPreferences(saved, { locale: 'de-DE' }).read(), { homeFavorites: true, market: 'ALL', hiddenCategoryIds: ['news', 'music'] });
    assert.deepEqual(saved.writes, [Preferences.STORAGE_KEY]);
    assert.equal(saved.getItem('evportal.state.v2'), 'portable configuration');
    assert.equal(saved.getItem('evportal.language.v1'), 'fr');
    assert.equal(saved.getItem('config'), 'legacy account');
});

test('a partial update preserves unknown fields already stored and never accepts unrelated patch data', () => {
    const saved = storage({ [Preferences.STORAGE_KEY]: JSON.stringify({ version: 1, homeFavorites: true, market: 'CA', hiddenCategoryIds: ['news'], futureOption: { enabled: true } }) });
    const api = Preferences.createPreferences(saved, { locale: 'en-US' });
    api.patch({ market: 'BE', access_token: 'unrelated patch field' });
    const record = JSON.parse(saved.getItem(Preferences.STORAGE_KEY));
    assert.deepEqual(record.futureOption, { enabled: true });
    assert.equal(record.homeFavorites, true);
    assert.deepEqual(record.hiddenCategoryIds, ['news']);
    assert.equal(record.access_token, undefined);
});

test('invalid changes are rejected atomically without changing memory or storage', () => {
    const saved = storage();
    const api = Preferences.createPreferences(saved, { locale: 'en-GB' });
    const initial = api.read();
    for (const patch of [null, [], { homeFavorites: 'true' }, { market: 'GLOBAL' }, { market: 'fr' }, { hiddenCategoryIds: 'news' }, { hiddenCategoryIds: ['favorites'] }, { hiddenCategoryIds: ['all'] }, { hiddenCategoryIds: ['../bad'] }, { hiddenCategoryIds: Array(51).fill('news') }]) {
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
    for (const raw of ['broken JSON', 'null', JSON.stringify({ version: 2, market: 'CA' }), JSON.stringify({ version: 1, homeFavorites: 'yes' })]) {
        const saved = storage({ [Preferences.STORAGE_KEY]: raw });
        const api = Preferences.createPreferences(saved, { locale: 'fr-FR' });
        assert.equal(api.persistent, false);
        api.patch({ homeFavorites: true });
        assert.equal(api.read().homeFavorites, true);
        assert.equal(saved.getItem(Preferences.STORAGE_KEY), raw);
        assert.equal(saved.writes.length, 0);
    }
});

test('blocked or full storage keeps temporary preferences and a later successful save recovers persistence', () => {
    const blocked = Preferences.createPreferences({ getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Blocked'); } }, { locale: 'en-US' });
    assert.equal(blocked.patch({ market: 'NZ' }).market, 'NZ');
    assert.equal(blocked.persistent, false);
    const saved = storage();
    const write = saved.setItem;
    saved.setItem = () => { throw new Error('Quota exceeded'); };
    const api = Preferences.createPreferences(saved, { locale: 'en-US' });
    api.patch({ homeFavorites: true });
    assert.equal(api.read().homeFavorites, true);
    assert.equal(api.persistent, false);
    saved.setItem = write;
    api.patch({ market: 'CA' });
    assert.equal(api.persistent, true);
    assert.equal(Preferences.createPreferences(saved).read().homeFavorites, true);
    const temporary = Preferences.createPreferences(null, { locale: 'en-US' });
    assert.equal(temporary.patch({ homeFavorites: true }).homeFavorites, true);
    assert.equal(temporary.persistent, false);
});
