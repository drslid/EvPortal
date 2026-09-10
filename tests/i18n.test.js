'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const I18n = require('../js/i18n.js');
const translations = require('../js/translations.js');

function storage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return { values, getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)) };
}

class Element {
    constructor(attributes = {}, value = '') {
        this.attributes = new Map(Object.entries(attributes));
        this.textContent = '';
        this.value = value;
        this.defaultValue = value;
    }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    matches() { return Array.from(this.attributes.keys()).some(name => name === 'data-i18n' || name.startsWith('data-i18n-')); }
    querySelectorAll() { return []; }
}

function environment(nodes = [], initial = {}) {
    const events = [];
    const metadata = new Element({ property: 'og:locale', content: 'fr_FR' });
    const doc = {
        readyState: 'complete', documentElement: {},
        querySelectorAll: () => nodes,
        querySelector: selector => selector === 'meta[property="og:locale"]' ? metadata : null
    };
    const win = {
        document: doc, navigator: { languages: ['fr-FR'] }, localStorage: storage(initial),
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
        dispatchEvent: event => events.push(event)
    };
    return { win, doc, metadata, events, api: I18n.createI18n({ window: win }) };
}

test('all eight bundled languages have complete strings and identical interpolation parameters', () => {
    const expected = Object.keys(translations.fr).sort();
    assert.ok(expected.length > 300);
    assert.deepEqual(Object.keys(translations).sort(), I18n.LANGUAGES.slice().sort());
    const placeholders = value => Array.from(value.matchAll(/\{([a-zA-Z0-9_]+)\}/g), match => match[1]).sort();
    for (const language of I18n.LANGUAGES) {
        assert.deepEqual(Object.keys(translations[language]).sort(), expected, language);
        for (const key of expected) {
            assert.equal(typeof translations[language][key], 'string', language + ':' + key);
            assert.ok(translations[language][key].trim(), language + ':' + key);
            assert.deepEqual(placeholders(translations[language][key]), placeholders(translations.fr[key]), language + ':' + key);
        }
    }
});

test('saved preference wins over browser locale, supported regional locales match, and English is the fallback', () => {
    for (const [navigator, saved, expected] of [
        [{ languages: ['fr-FR'] }, 'de', 'de'],
        [{ languages: ['pt-BR'] }, undefined, 'pt'],
        [{ languages: ['ar-SA'] }, undefined, 'ar'],
        [{ languages: ['xx-ZZ', 'es-MX'] }, undefined, 'es'],
        [{ languages: [], language: 'it-IT' }, undefined, 'it'],
        [{ language: 'ru-RU' }, 'invalid', 'ru'],
        [{ languages: ['ja-JP'] }, undefined, 'en'],
        [{}, undefined, 'en']
    ]) {
        const savedStorage = storage(saved ? { [I18n.STORAGE_KEY]: saved } : {});
        assert.equal(I18n.createI18n({ navigator, storage: savedStorage }).language, expected);
    }
    assert.equal(I18n.supportedLanguage('EN-us'), 'en');
    assert.equal(I18n.supportedLanguage('pt_BR'), 'pt');
    assert.equal(I18n.supportedLanguage(null), null);
});

test('language changes persist separately, update document direction and Open Graph locale, and emit one event', () => {
    const { api, win, doc, metadata, events } = environment([], { 'evportal.state.v2': 'user configuration' });
    assert.equal(doc.documentElement.lang, 'fr');
    assert.equal(api.setLanguage('ar-SA'), 'ar');
    assert.equal(win.localStorage.getItem(I18n.STORAGE_KEY), 'ar');
    assert.equal(win.localStorage.getItem('evportal.state.v2'), 'user configuration');
    assert.equal(doc.documentElement.dir, 'rtl');
    assert.equal(metadata.getAttribute('content'), 'ar_AR');
    assert.deepEqual(events.map(event => [event.type, event.detail]), [['evportal:languagechange', { language: 'ar' }]]);
    api.setLanguage('ar');
    assert.equal(events.length, 1);
    api.setLanguage('pt-BR');
    assert.equal(doc.documentElement.dir, 'ltr');
    assert.equal(doc.documentElement.lang, 'pt');
    assert.equal(metadata.getAttribute('content'), 'pt_PT');
    assert.equal(api.setLanguage('unknown'), 'en');
});

test('text, accessible labels, titles, placeholders and metadata translate through text and attribute assignment', () => {
    const text = new Element({ 'data-i18n': 'app.all' });
    const button = new Element({ 'data-i18n-aria-label': 'app.move', 'data-i18n-title': 'app.move', 'data-i18n-params': JSON.stringify({ name: '<img src=x onerror=alert(1)>' }) });
    const input = new Element({ 'data-i18n-placeholder': 'app.newCategory' });
    const meta = new Element({ 'data-i18n-content': 'app.allDescription' });
    const { api } = environment([text, button, input, meta]);
    api.setLanguage('en');
    assert.equal(text.textContent, 'All');
    assert.equal(button.getAttribute('aria-label'), 'Move <img src=x onerror=alert(1)>');
    assert.equal(button.getAttribute('title'), button.getAttribute('aria-label'));
    assert.equal(input.getAttribute('placeholder'), 'New category');
    assert.equal(meta.getAttribute('content'), translations.en['app.allDescription']);
    const dynamicRoot = new Element({ 'data-i18n': 'app.favorites' });
    api.translateDOM(dynamicRoot);
    assert.equal(dynamicRoot.textContent, 'Favorites');
    assert.equal(api.t('app.move', { name: '$& {other}' }), 'Move $& {other}');
});

test('default input values translate while user-entered values remain untouched through language switches', () => {
    const defaultInput = new Element({ 'data-i18n-value': 'app.newCategory' }, 'Nouvelle catégorie');
    const editedInput = new Element({ 'data-i18n-value': 'app.newCategory' }, 'Nouvelle catégorie');
    editedInput.value = 'Mes vacances';
    const { api } = environment([defaultInput, editedInput]);
    api.setLanguage('en');
    assert.equal(defaultInput.value, 'New category');
    assert.equal(defaultInput.defaultValue, 'New category');
    assert.equal(editedInput.value, 'Mes vacances');
    defaultInput.value = 'My trips';
    api.setLanguage('ar');
    assert.equal(defaultInput.value, 'My trips');
    assert.equal(editedInput.value, 'Mes vacances');
});

test('only unchanged catalog labels translate and custom names are never replaced', () => {
    const api = I18n.createI18n({ navigator: { language: 'en' } });
    const catalog = { categories: [{ id: 'charging', label: 'Recharge' }, { id: 'future', label: 'Future service' }] };
    assert.equal(api.category({ id: 'charging', label: 'Recharge' }, catalog), 'Charging');
    assert.equal(api.category({ id: 'charging', label: 'Mes bornes' }, catalog), 'Mes bornes');
    assert.equal(api.category({ id: 'custom-1', label: 'Recharge' }, catalog), 'Recharge');
    assert.equal(api.category(catalog.categories[1], catalog), 'Future service');
    assert.equal(api.category({ id: 'custom', label: 'Mon dossier' }), 'Mon dossier');
    api.setLanguage('ar');
    assert.equal(api.category({ id: 'charging', label: 'Recharge' }, catalog), 'الشحن');
    assert.deepEqual(catalog.categories[0], { id: 'charging', label: 'Recharge' });
});

test('unavailable storage and unknown keys preserve usable translations without a network dependency', () => {
    const api = I18n.createI18n({ navigator: { language: 'it-IT' }, storage: { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Quota'); } } });
    assert.equal(api.language, 'it');
    assert.doesNotThrow(() => api.setLanguage('de'));
    assert.equal(api.t('app.favorites'), 'Favoriten');
    assert.equal(api.t('not.a.real.key'), 'not.a.real.key');
    const fallback = I18n.createI18n({ navigator: { language: 'ar' }, translations: { en: { test: 'English {name}' }, ar: {} } });
    assert.equal(fallback.t('test', { name: 'name' }), 'English name');
    assert.equal(fallback.t('test'), 'English {name}');
});
