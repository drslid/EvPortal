/* Device preferences never enter the portable EvPortal configuration. */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.EVPreferences = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';
    const STORAGE_KEY = 'evportal.preferences.v1';
    const MARKETS = Object.freeze(['ALL', 'FR', 'CA', 'US', 'MX', 'BE', 'GB', 'DE', 'ES', 'IT', 'PT', 'AU', 'NZ', 'CH']);
    const ID_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;

    function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
    function invalid() {
        const error = new TypeError('Invalid device preferences.');
        error.code = 'INVALID_PREFERENCES';
        error.i18nKey = 'prefs.invalid';
        return error;
    }

    function suggestMarket(locale) {
        if (typeof locale !== 'string') return 'ALL';
        const normalized = locale.trim().replace(/_/g, '-');
        let region;
        try {
            if (root.Intl && typeof root.Intl.Locale === 'function') region = new root.Intl.Locale(normalized).region;
            else {
                // Read only an explicit region; language alone never implies a country.
                const match = normalized.match(/^[a-z]{2,3}(?:-[a-z]{4})?-([a-z]{2})(?:-|$)/i);
                region = match && match[1].toUpperCase();
            }
        } catch (_) { return 'ALL'; }
        return MARKETS.includes(region) ? region : 'ALL';
    }

    function validated(value, initial) {
        if (!isObject(value)) throw invalid();
        const result = {
            homeFavorites: initial.homeFavorites,
            market: initial.market,
            hiddenCategoryIds: initial.hiddenCategoryIds.slice()
        };
        if (Object.prototype.hasOwnProperty.call(value, 'homeFavorites')) {
            if (typeof value.homeFavorites !== 'boolean') throw invalid();
            result.homeFavorites = value.homeFavorites;
        }
        if (Object.prototype.hasOwnProperty.call(value, 'market')) {
            if (!MARKETS.includes(value.market)) throw invalid();
            result.market = value.market;
        }
        if (Object.prototype.hasOwnProperty.call(value, 'hiddenCategoryIds')) {
            if (!Array.isArray(value.hiddenCategoryIds) || value.hiddenCategoryIds.length > 50 || value.hiddenCategoryIds.some(function (id) {
                return typeof id !== 'string' || !ID_PATTERN.test(id) || id === 'all' || id === 'favorites';
            })) throw invalid();
            result.hiddenCategoryIds = Array.from(new Set(value.hiddenCategoryIds));
        }
        return result;
    }

    function createPreferences(storage, options) {
        options = options || {};
        if (storage === undefined) {
            try { storage = root.localStorage || null; } catch (_) { storage = null; }
        }
        const locale = options.locale === undefined ? root.navigator && root.navigator.language : options.locale;
        let current = { homeFavorites: false, market: suggestMarket(locale), hiddenCategoryIds: [] };
        let savedFields = Object.create(null);
        let canWrite = Boolean(storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function');
        let persistent = canWrite;
        try {
            const raw = canWrite ? storage.getItem(STORAGE_KEY) : null;
            if (raw !== null) {
                const saved = JSON.parse(raw);
                if (!isObject(saved) || saved.version !== 1) throw invalid();
                current = validated(saved, current);
                savedFields = Object.assign(Object.create(null), saved);
            }
        } catch (_) {
            // Preserve corrupt or future records for recovery instead of replacing them.
            canWrite = false;
            persistent = false;
        }

        function read() {
            return { homeFavorites: current.homeFavorites, market: current.market, hiddenCategoryIds: current.hiddenCategoryIds.slice() };
        }

        function patch(changes) {
            const next = validated(changes, current);
            persistent = false;
            if (canWrite) {
                try {
                    const record = Object.assign(Object.create(null), savedFields, next, { version: 1 });
                    storage.setItem(STORAGE_KEY, JSON.stringify(record));
                    savedFields = record;
                    persistent = true;
                } catch (_) { /* A quota or privacy restriction still permits session preferences. */ }
            }
            current = next;
            return read();
        }

        const api = { read: read, patch: patch };
        Object.defineProperty(api, 'persistent', { enumerable: true, get: function () { return persistent; } });
        return api;
    }

    return { STORAGE_KEY: STORAGE_KEY, MARKETS: MARKETS, suggestMarket: suggestMarket, createPreferences: createPreferences };
}));
