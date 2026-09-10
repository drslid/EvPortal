/* Local interface translations. User links, labels and settings remain untouched. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(null, require('./translations.js'));
    else root.EVI18n = factory(root, root.EV_TRANSLATIONS || {});
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root, bundledTranslations) {
    'use strict';
    const STORAGE_KEY = 'evportal.language.v1';
    const LANGUAGES = Object.freeze(['en', 'fr', 'es', 'de', 'it', 'ru', 'ar', 'pt']);
    const LANGUAGE_NAMES = Object.freeze({ en: 'English', fr: 'Français', es: 'Español', de: 'Deutsch', it: 'Italiano', ru: 'Русский', ar: 'العربية', pt: 'Português' });

    function supportedLanguage(value) {
        if (typeof value !== 'string') return null;
        const code = value.trim().toLowerCase().split(/[-_]/)[0];
        return LANGUAGES.includes(code) ? code : null;
    }

    function createI18n(options) {
        options = options || {};
        const win = options.window || null;
        const doc = options.document || (win && win.document) || null;
        const navigator = options.navigator || (win && win.navigator) || {};
        const translations = options.translations || bundledTranslations;
        let storage = options.storage;
        if (storage === undefined) {
            try { storage = win && win.localStorage; } catch (_) { storage = null; }
        }
        let saved;
        try { saved = storage && storage.getItem(STORAGE_KEY); } catch (_) { /* Private browsing keeps a session preference. */ }
        const browserLanguages = Array.isArray(navigator.languages) ? navigator.languages : [navigator.language];
        let language = supportedLanguage(saved) || browserLanguages.map(supportedLanguage).find(Boolean) || supportedLanguage(navigator.language) || 'en';
        const translatedValues = new WeakMap();

        function t(key, params) {
            const selected = translations[language] || {};
            const english = translations.en || {};
            const template = Object.prototype.hasOwnProperty.call(selected, key) ? selected[key]
                : (Object.prototype.hasOwnProperty.call(english, key) ? english[key] : key);
            return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, function (match, name) {
                return params && Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match;
            });
        }

        function translateDOM(scope) {
            scope = scope || doc;
            if (!scope) return;
            const attributes = ['text', 'aria-label', 'title', 'placeholder', 'content', 'value'];
            const selector = attributes.map(function (attribute) { return '[data-i18n' + (attribute === 'text' ? '' : '-' + attribute) + ']'; }).join(',');
            const nodes = Array.from(scope.querySelectorAll ? scope.querySelectorAll(selector) : []);
            if (scope.matches && scope.matches(selector)) nodes.unshift(scope);
            nodes.forEach(function (node) {
                let params;
                try { params = JSON.parse(node.getAttribute('data-i18n-params') || '{}'); } catch (_) { params = {}; }
                attributes.forEach(function (attribute) {
                    const key = node.getAttribute('data-i18n' + (attribute === 'text' ? '' : '-' + attribute));
                    if (!key) return;
                    const value = t(key, params);
                    if (attribute === 'text') node.textContent = value;
                    else if (attribute === 'value') {
                        const previous = translatedValues.get(node);
                        const initial = node.defaultValue === undefined ? node.getAttribute('value') || '' : node.defaultValue;
                        if (node.value === (previous === undefined ? initial : previous)) {
                            node.value = value;
                            node.defaultValue = value;
                            translatedValues.set(node, value);
                        }
                    } else node.setAttribute(attribute, value);
                });
            });
            if (doc && doc.documentElement) {
                doc.documentElement.lang = language;
                doc.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
                const localeMeta = doc.querySelector && doc.querySelector('meta[property="og:locale"]');
                if (localeMeta) localeMeta.setAttribute('content', { en: 'en_US', fr: 'fr_FR', es: 'es_ES', de: 'de_DE', it: 'it_IT', ru: 'ru_RU', ar: 'ar_AR', pt: 'pt_PT' }[language]);
            }
        }

        function setLanguage(value) {
            const next = supportedLanguage(value) || 'en';
            const changed = next !== language;
            language = next;
            try { if (storage) storage.setItem(STORAGE_KEY, language); } catch (_) { /* Translation stays available without storage. */ }
            translateDOM();
            if (changed && win && typeof win.dispatchEvent === 'function' && typeof win.CustomEvent === 'function') {
                win.dispatchEvent(new win.CustomEvent('evportal:languagechange', { detail: { language: language } }));
            }
            return language;
        }

        function category(item, catalog) {
            const original = catalog && catalog.categories.find(function (entry) { return entry.id === item.id; });
            const key = 'category.' + item.id;
            return original && original.label === item.label && Object.prototype.hasOwnProperty.call(translations.en || {}, key) ? t(key) : item.label;
        }

        const api = { STORAGE_KEY, LANGUAGES, LANGUAGE_NAMES, t, setLanguage, translateDOM, category, supportedLanguage };
        Object.defineProperty(api, 'language', { enumerable: true, get: function () { return language; } });
        if (doc) {
            if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', function () { translateDOM(); }, { once: true });
            else translateDOM();
        }
        return api;
    }

    const api = createI18n({ window: root });
    api.createI18n = createI18n;
    return api;
}));
