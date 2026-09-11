'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const SEO = require('../js/seo.js');
const I18n = require('../js/i18n.js');

function environment(options = {}) {
    const assignments = [], changes = [], metadata = [];
    function element(attributes) {
        const values = new Map(Object.entries(attributes || {}));
        return { values, setAttribute: (key, value) => values.set(key, value), getAttribute: key => values.get(key) };
    }
    const robots = options.missingRobots ? null : element({ name: 'robots', content: 'index, follow, max-image-preview:large' });
    const canonical = element({ rel: 'canonical', href: 'https://drslid.github.io/EvPortal/fr/' });
    if (robots) metadata.push(robots);
    const doc = {
        currentScript: { src: options.scriptURL || 'https://drslid.github.io/EvPortal/js/seo.js' },
        querySelector: selector => selector === 'meta[name="robots"]' ? metadata.find(item => item.getAttribute('name') === 'robots') || null
            : selector === 'link[rel="canonical"]' ? canonical : null,
        createElement: () => element(),
        head: { appendChild: item => metadata.push(item) }
    };
    const win = {
        document: doc,
        location: { href: options.url || 'https://drslid.github.io/EvPortal/fr/', assign: url => assignments.push(url) },
        EVI18n: { pageLanguage: options.pageLanguage === undefined ? 'fr' : options.pageLanguage,
            setLanguage(value) { const language = I18n.supportedLanguage(value) || 'en'; changes.push(language); return language; } }
    };
    return { api: SEO.createSEO(win), win, doc, metadata, canonical, assignments, changes };
}

test('service assets resolve against the script deployment instead of a translated page directory', () => {
    for (const [scriptURL, url, expected] of [
        ['https://drslid.github.io/EvPortal/js/seo.js', 'https://drslid.github.io/EvPortal/ar/', 'https://drslid.github.io/EvPortal/img/services/example.png'],
        ['http://127.0.0.1:4187/js/seo.js', 'http://127.0.0.1:4187/de/', 'http://127.0.0.1:4187/img/services/example.png'],
        ['https://portal.example/car/portal/js/seo.js', 'https://portal.example/car/portal/pt/aide.html', 'https://portal.example/car/portal/img/services/example.png']
    ]) {
        const { api, doc } = environment({ scriptURL, url });
        doc.currentScript = null;
        assert.equal(api.asset('./img/services/example.png'), expected);
    }
    assert.equal(SEO.asset('./img/favicon.ico'), './img/favicon.ico', 'A browserless caller keeps the original path');
});

test('configuration queries receive fixed noindex metadata without copying private values or changing the canonical', () => {
    for (const query of ['?code=PRIVATE-code', '?config=PRIVATE-config', '?code=', '?other=value&%63ode=PRIVATE-encoded']) {
        const { metadata, canonical, assignments, changes } = environment({ url: 'https://drslid.github.io/EvPortal/fr/' + query + '#receive=PRIVATE-secret' });
        assert.equal(metadata.length, 1);
        assert.equal(metadata[0].getAttribute('content'), 'noindex,follow');
        assert.equal(JSON.stringify(Array.from(metadata[0].values)).includes('PRIVATE'), false);
        assert.equal(canonical.getAttribute('href'), 'https://drslid.github.io/EvPortal/fr/');
        assert.deepEqual(assignments, []);
        assert.deepEqual(changes, [], 'Initial SEO setup never switches language');
    }
    const { metadata } = environment({ url: 'https://drslid.github.io/EvPortal/?config=Saved', missingRobots: true });
    assert.equal(metadata.length, 1);
    assert.equal(metadata[0].getAttribute('name'), 'robots');
    assert.equal(metadata[0].getAttribute('content'), 'noindex,follow');
});

test('normal localized pages and QR fragments remain indexable', () => {
    for (const suffix of ['', '?source=code', '#receive=secret', '#download=secret', '#code=Saved', '?Code=Saved']) {
        const { metadata, assignments } = environment({ url: 'https://drslid.github.io/EvPortal/ar/' + suffix });
        assert.equal(metadata[0].getAttribute('content'), 'index, follow, max-image-preview:large');
        assert.deepEqual(assignments, []);
    }
});

test('explicit language selection navigates localized app and help pages while preserving query and fragment', () => {
    for (const [url, language, expected] of [
        ['https://drslid.github.io/EvPortal/fr/?code=Saved%2D09-12#receive=id.key.token', 'ar-SA', 'https://drslid.github.io/EvPortal/ar/?code=Saved%2D09-12#receive=id.key.token'],
        ['https://drslid.github.io/EvPortal/fr/index.html?config=Old#music', 'pt', 'https://drslid.github.io/EvPortal/pt/?config=Old#music'],
        ['https://drslid.github.io/EvPortal/fr/aide.html?source=help#backup', 'en', 'https://drslid.github.io/EvPortal/en/aide.html?source=help#backup']
    ]) {
        const { api, assignments, changes, canonical } = environment({ url });
        const result = api.selectLanguage(language);
        assert.deepEqual(changes, [result]);
        assert.deepEqual(assignments, [expected]);
        assert.equal(canonical.getAttribute('href'), 'https://drslid.github.io/EvPortal/fr/');
    }
    const custom = environment({ scriptURL: 'http://127.0.0.1:4187/custom/js/seo.js', url: 'http://127.0.0.1:4187/custom/fr/aide.html' });
    custom.api.selectLanguage('it');
    assert.deepEqual(custom.assignments, ['http://127.0.0.1:4187/custom/it/aide.html']);
});

test('the legacy root and a selection of the current page language never navigate', () => {
    const legacy = environment({ url: 'https://drslid.github.io/EvPortal/?code=Saved#music', pageLanguage: null });
    assert.equal(legacy.api.selectLanguage('de'), 'de');
    assert.deepEqual(legacy.changes, ['de']);
    assert.deepEqual(legacy.assignments, []);
    const localized = environment();
    assert.equal(localized.api.selectLanguage('fr-FR'), 'fr');
    assert.deepEqual(localized.changes, ['fr']);
    assert.deepEqual(localized.assignments, []);
});
