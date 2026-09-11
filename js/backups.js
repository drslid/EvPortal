/* Local backup library. Adding a backup never replaces the active portal. */
(function (root, factory) {
    const api = factory(root, typeof module === 'object' && module.exports ? require('./state.js') : root.EVState);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.EVBackups = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root, Core) {
    'use strict';
    const STORAGE_KEY = 'evportal.backups.v1';
    const MAX_BACKUPS = 50;
    const MAX_TITLE_LENGTH = 120;
    const SOURCES = Object.freeze(['created', 'link', 'file', 'transfer']);
    const ID_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;
    const encoder = new TextEncoder();

    function error(key, params) {
        const failure = new Error(root.EVI18n ? root.EVI18n.t(key, params) : key);
        failure.i18nKey = key;
        failure.i18nParams = params || {};
        return failure;
    }
    function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
    function validID(value) { return typeof value === 'string' && ID_PATTERN.test(value); }

    function record(value) {
        if (!object(value) || !validID(value.id) || typeof value.title !== 'string' || !value.title.trim()
            || value.title.trim().length > MAX_TITLE_LENGTH || !SOURCES.includes(value.source)
            || !Number.isSafeInteger(value.createdAt) || value.createdAt < 0 || value.createdAt > 8640000000000000) {
            throw error('backup.invalidBackup');
        }
        const normalized = { id: value.id, title: value.title.trim(), createdAt: value.createdAt, source: value.source };
        try {
            if (value.path !== undefined) normalized.path = Core.telegraphPath(value.path);
            normalized.state = Core.normalizeState(value.state);
        } catch (_) { throw error('backup.invalidBackup'); }
        if (encoder.encode(JSON.stringify(normalized)).length > Core.MAX_FILE_BYTES) throw error('backup.tooLarge', { max: 2 });
        return normalized;
    }

    function createLibrary(storage) {
        if (storage === undefined) {
            try { storage = root.localStorage || null; } catch (_) { storage = null; }
        }
        function read() {
            let raw;
            try {
                if (!storage || typeof storage.getItem !== 'function') throw new Error();
                raw = storage.getItem(STORAGE_KEY);
            } catch (_) { throw error('backup.storageUnavailable'); }
            if (raw === null) return { version: 1, backups: [] };
            try {
                if (typeof raw !== 'string' || encoder.encode(raw).length > MAX_BACKUPS * Core.MAX_FILE_BYTES + 4096) throw new Error();
                const parsed = JSON.parse(raw);
                if (!object(parsed) || parsed.version !== 1 || !Array.isArray(parsed.backups) || parsed.backups.length > MAX_BACKUPS) throw new Error();
                const ids = new Set();
                const paths = new Set();
                const backups = parsed.backups.map(function (value) {
                    const item = record(value);
                    if (ids.has(item.id) || (item.path && paths.has(item.path))) throw new Error();
                    ids.add(item.id);
                    if (item.path) paths.add(item.path);
                    return item;
                });
                return { version: 1, backups: backups };
            } catch (_) { throw error('backup.invalidLibrary'); }
        }
        function write(library) {
            try {
                if (!storage || typeof storage.setItem !== 'function') throw new Error();
                // localStorage replaces one key atomically or throws before changing
                // its value. No clear/remove or write to the active state is needed.
                storage.setItem(STORAGE_KEY, JSON.stringify(library));
            } catch (_) { throw error('backup.storageUnavailable'); }
        }
        function list() {
            return read().backups.reverse().sort(function (a, b) { return b.createdAt - a.createdAt; });
        }
        function get(id) {
            if (!validID(id)) throw error('backup.invalidBackup');
            return read().backups.find(function (item) { return item.id === id; }) || null;
        }
        function add(value) {
            // Never rely on a cached list: another tab may have added a backup.
            const library = read();
            if (!object(value)) throw error('backup.invalidBackup');
            let path;
            try { if (value.path !== undefined) path = Core.telegraphPath(value.path); }
            catch (_) { throw error('backup.invalidBackup'); }
            const existing = path && library.backups.find(function (item) { return item.path === path; });
            if (!existing && library.backups.length >= MAX_BACKUPS) throw error('backup.limit', { max: MAX_BACKUPS });
            let id = existing ? existing.id : Core.id('backup');
            while (!existing && library.backups.some(function (item) { return item.id === id; })) id = Core.id('backup');
            const next = record({ id: id, title: value.title, createdAt: existing ? existing.createdAt : Date.now(),
                source: value.source, path: path, state: value.state });
            if (existing) library.backups[library.backups.indexOf(existing)] = next;
            else library.backups.push(next);
            write(library);
            return next;
        }
        function remove(id) {
            if (!validID(id)) throw error('backup.invalidBackup');
            const library = read();
            const remaining = library.backups.filter(function (item) { return item.id !== id; });
            if (remaining.length === library.backups.length) return false;
            write({ version: 1, backups: remaining });
            return true;
        }
        return { list: list, get: get, add: add, remove: remove };
    }

    return { STORAGE_KEY: STORAGE_KEY, MAX_BACKUPS: MAX_BACKUPS, MAX_TITLE_LENGTH: MAX_TITLE_LENGTH, SOURCES: SOURCES, createLibrary: createLibrary };
}));
