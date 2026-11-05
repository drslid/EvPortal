const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Regions = require('../js/regions.js');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/catalog.js'), 'utf8'), context);
const catalog = JSON.parse(JSON.stringify(context.window.EV_CATALOG));
const services = value => value.categories.flatMap(category => category.shortcuts);
const find = (value, id) => services(value).find(shortcut => shortcut.serviceId === id);
const prefs = (country = 'WORLD', contentLanguages = []) => ({ version: 1, country, contentLanguages });
function memory(raw) {
    return { value: raw || null, writes: 0, getItem() { return this.value; }, setItem(key, value) { this.value = value; this.writes++; } };
}

test('country and content languages are independent from interface language', () => {
    const storage = memory();
    const store = Regions.createPreferences(storage);
    assert.deepEqual(store.read(), prefs());
    assert.deepEqual(store.patch({ country: 'CA', contentLanguages: ['fr', 'en'] }), prefs('CA', ['fr', 'en']));
    for (const lang of ['fr', 'en', 'ar']) {
        assert.equal(find(Regions.applyCatalog(catalog, store.read(), lang), 'crave').serviceId, 'crave');
        assert.equal(find(Regions.applyCatalog(catalog, store.read(), lang), 'radio-france').serviceId, 'radio-france');
    }
    const reloaded = Regions.createPreferences(storage).read();
    assert.deepEqual(reloaded, prefs('CA', ['fr', 'en']));
    const modifiedCopy = store.read();
    modifiedCopy.contentLanguages.push('de');
    assert.deepEqual(store.read().contentLanguages, ['fr', 'en']);
});

test('invalid settings never replace a valid saved record', () => {
    const storage = memory(JSON.stringify(prefs('DE', ['de'])));
    const store = Regions.createPreferences(storage);
    for (const change of [{ country: 'ZZ' }, { country: 'fr' }, { contentLanguages: ['xx'] }, { contentLanguages: 'en' }, { uiLang: 'en' }, [], null]) {
        assert.throws(() => store.patch(change), { code: 'INVALID_REGION_PREFERENCES' });
    }
    assert.deepEqual(store.read(), prefs('DE', ['de']));
    assert.equal(storage.writes, 0);
    for (const raw of ['broken', JSON.stringify({ version: 2, country: 'US' }), JSON.stringify({ version: 1, country: 'FR', contentLanguages: ['<script>'] })]) {
        const broken = memory(raw);
        const safe = Regions.createPreferences(broken);
        assert.deepEqual(safe.read(), prefs());
        safe.patch({ country: 'GB' });
        assert.equal(broken.value, raw);
        assert.equal(safe.persistent, false);
    }
});

test('unavailable storage keeps preferences usable for the session', () => {
    const store = Regions.createPreferences({ getItem() { return null; }, setItem() { throw new Error('Quota'); } });
    assert.deepEqual(store.patch({ country: 'AE', contentLanguages: ['ar'] }), prefs('AE', ['ar']));
    assert.equal(store.persistent, false);
});

test('canonical enrichment keeps all original identities and adds optional services exactly once', () => {
    const enriched = Regions.enrichCatalog(catalog, 'en');
    assert.deepEqual(Regions.enrichCatalog(enriched, 'en'), enriched);
    assert.deepEqual(services(enriched).filter(item => services(catalog).some(original => original.serviceId === item.serviceId)), services(catalog));
    assert.ok(find(enriched, 'rtve-play'));
    assert.equal(find(enriched, 'rtve-play').defaultIncluded, false);
    const countries = Regions.COUNTRIES.map(entry => entry.code);
    for (const country of ['WORLD', 'FR', 'US', 'GB', 'DE', 'ES', 'IT', 'PT', 'BR', 'CA', 'BE', 'CH', 'AU', 'AE']) assert.ok(countries.includes(country));
});

test('only suggestions are filtered; source catalogue and saved favorites remain unchanged', () => {
    const original = JSON.stringify(catalog);
    const saved = Object.assign({ id: 'saved-one', favorite: true, customName: 'Ma radio' }, find(catalog, 'radio-france'));
    const savedOriginal = JSON.stringify(saved);
    const german = Regions.applyCatalog(catalog, prefs('DE', ['de']), 'fr');
    assert.equal(find(german, 'radio-france'), undefined);
    assert.equal(find(german, 'bison-fute'), undefined);
    assert.ok(find(german, 'ard-mediathek'));
    assert.ok(find(german, 'windy'), 'Unknown language/territory must not be silently excluded');
    assert.equal(JSON.stringify(catalog), original);
    const rendered = Regions.localizedShortcut(saved, prefs('DE', ['de']), 'en');
    assert.equal(rendered.favorite, true);
    assert.equal(rendered.id, 'saved-one');
    assert.equal(rendered.customName, 'Ma radio');
    assert.equal(rendered.url, saved.url);
    assert.equal(JSON.stringify(saved), savedOriginal);
});

test('localized URLs retain identity and honor content language before UI language', () => {
    const original = find(catalog, 'wikipedia');
    const localized = Regions.localizedShortcut(original, prefs('GB', ['de']), 'fr');
    assert.equal(localized.serviceId, 'wikipedia');
    assert.equal(localized.url, 'https://de.wikipedia.org/');
    assert.equal(Regions.localizedShortcut(localized, prefs('GB', ['en']), 'fr').url, 'https://en.wikipedia.org/');
    assert.equal(Regions.localizedShortcut(find(catalog, 'apple-tv'), prefs('US'), 'fr').url, 'https://tv.apple.com/');
    assert.equal(Regions.localizedShortcut(find(catalog, 'apple-tv'), prefs('FR'), 'en').url, 'https://tv.apple.com/fr');
    assert.equal(Regions.localizedShortcut(find(catalog, 'justwatch'), prefs('GB'), 'fr').url, 'https://www.justwatch.com/uk');
});

test('custom addresses are never rewritten by domain matching or a forged service identity', () => {
    for (const url of ['https://fr.wikipedia.org/wiki/Tesla', 'https://fr.wikipedia.org/?custom=1', 'https://example.com/', 'https://www.waze.com/live-map/?locale=fr&to=Paris']) {
        const shortcut = { id: 'custom', serviceId: url.includes('waze') ? 'waze' : 'wikipedia', url, name: 'Mine' };
        assert.equal(Regions.localizedShortcut(shortcut, prefs('DE', ['de']), 'en').url, url);
    }
    const unrecognized = { url: 'https://fr.wikipedia.org/', name: 'Custom without serviceId' };
    assert.equal(Regions.localizedShortcut(unrecognized, prefs('US'), 'en').url, unrecognized.url);
});

test('known URL detection requires a matching identity and exact official address', () => {
    assert.equal(Regions.isKnownURL('radio-france', 'https://www.radiofrance.fr/', catalog), true);
    assert.equal(Regions.isKnownURL('wikipedia', 'https://de.wikipedia.org/', catalog), true);
    assert.equal(Regions.isKnownURL('bbc-sounds', 'https://www.bbc.co.uk/sounds', catalog), true);
    assert.equal(Regions.isKnownURL('pluto-tv', 'https://pluto.tv/fr/watch/live-tv/', catalog), true);
    assert.equal(Regions.isKnownURL('radio-france', 'https://www.radiofrance.fr/fip', catalog), false);
    assert.equal(Regions.isKnownURL('wikipedia', 'https://de.wikipedia.org/wiki/Tesla', catalog), false);
    assert.equal(Regions.isKnownURL('made-up', 'https://de.wikipedia.org/', catalog), false);
    assert.equal(Regions.isKnownURL(null, 'https://de.wikipedia.org/', catalog), false);
});

test('replacement destinations and known service URLs stay harmonized', () => {
    const localized = Regions.applyCatalog(catalog, prefs('US', ['en']), 'en');
    for (const replacement of localized.replacements) {
        const source = catalog.replacements.find(item => item.from === replacement.from);
        const service = services(catalog).find(item => item.url === source.to);
        if (service && find(localized, service.serviceId)) assert.equal(replacement.to, find(localized, service.serviceId).url, replacement.from);
    }
});

test('all international candidates keep availability and Tesla compatibility unknown', () => {
    const worldwide = Regions.applyCatalog(catalog, prefs(), 'en');
    const ids = services(worldwide).map(shortcut => shortcut.serviceId);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ['bbc-sounds', 'ard-mediathek', 'zdf-heute', 'deutschlandfunk', 'rtve-play']) {
        const shortcut = find(worldwide, id);
        assert.equal(new URL(shortcut.url).protocol, 'https:');
        assert.equal(shortcut.defaultIncluded, false);
        assert.equal(shortcut.regionInfo.availability, 'unknown');
        assert.equal(shortcut.regionInfo.teslaCompatibility, 'untested');
    }
    assert.equal(find(Regions.applyCatalog(catalog, prefs('GB', ['en']), 'en'), 'ard-mediathek'), undefined);
    assert.ok(find(Regions.applyCatalog(catalog, prefs('GB', ['en']), 'en'), 'bbc-sounds'));
    for (const language of Regions.LANGUAGES) {
        assert.equal(Regions.messages(language.code).title.length > 0, true);
        assert.equal(Regions.countryLabel('WORLD', language.code), Regions.messages(language.code).allCountries);
    }
});
