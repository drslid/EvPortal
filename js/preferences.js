/* Device preferences never enter the portable EvPortal configuration. */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.EVPreferences = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';
    const STORAGE_KEY = 'evportal.preferences.v1';
    const ID_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;

    function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
    function invalid() {
        const error = new TypeError('Invalid device preferences.');
        error.code = 'INVALID_PREFERENCES';
        error.i18nKey = 'prefs.invalid';
        return error;
    }

    function validated(value, initial) {
        if (!isObject(value)) throw invalid();
        const result = {
            homeFavorites: initial.homeFavorites,
            hiddenCategoryIds: initial.hiddenCategoryIds.slice(),
            shortcutSize: initial.shortcutSize,
            showShortcutNames: initial.showShortcutNames
        };
        if (Object.prototype.hasOwnProperty.call(value, 'homeFavorites')) {
            if (typeof value.homeFavorites !== 'boolean') throw invalid();
            result.homeFavorites = value.homeFavorites;
        }
        if (Object.prototype.hasOwnProperty.call(value, 'hiddenCategoryIds')) {
            if (!Array.isArray(value.hiddenCategoryIds) || value.hiddenCategoryIds.length > 50 || value.hiddenCategoryIds.some(function (id) {
                return typeof id !== 'string' || !ID_PATTERN.test(id) || id === 'all' || id === 'favorites';
            })) throw invalid();
            result.hiddenCategoryIds = Array.from(new Set(value.hiddenCategoryIds));
        }
        if (Object.prototype.hasOwnProperty.call(value, 'shortcutSize')) {
            if (value.shortcutSize !== 'standard' && value.shortcutSize !== 'small') throw invalid();
            result.shortcutSize = value.shortcutSize;
        }
        if (Object.prototype.hasOwnProperty.call(value, 'showShortcutNames')) {
            if (typeof value.showShortcutNames !== 'boolean') throw invalid();
            result.showShortcutNames = value.showShortcutNames;
        }
        return result;
    }

    function createPreferences(storage) {
        if (storage === undefined) {
            try { storage = root.localStorage || null; } catch (_) { storage = null; }
        }
        let current = { homeFavorites: false, hiddenCategoryIds: [], shortcutSize: 'standard', showShortcutNames: true };
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
            return { homeFavorites: current.homeFavorites, hiddenCategoryIds: current.hiddenCategoryIds.slice(), shortcutSize: current.shortcutSize, showShortcutNames: current.showShortcutNames };
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

    return { STORAGE_KEY: STORAGE_KEY, createPreferences: createPreferences };
}));
