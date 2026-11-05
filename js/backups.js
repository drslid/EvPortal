/* Local backup library. Adding a backup never replaces the active portal. */
(function (root, factory) {
    const api = factory(root, typeof module === 'object' && module.exports ? require('./state.js') : root.EVState,
        typeof module === 'object' && module.exports ? require('./storage.js') : root.EVStorage);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.EVBackups = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root, Core, Storage) {
    'use strict';
    const STORAGE_KEY = 'evportal.backups.v1';
    const MAX_BACKUPS = 50;
    const MAX_TITLE_LENGTH = 120;
    const MAX_LIBRARY_BYTES = 20 * 1024 * 1024;
    const MIGRATION_KEY = STORAGE_KEY + '.indexeddb';
    const CHANGE_KEY = STORAGE_KEY + '.changed';
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

    function normalizeLibrary(parsed) {
        if (!object(parsed) || parsed.version !== 1 || !Array.isArray(parsed.backups) || parsed.backups.length > MAX_BACKUPS) throw error('backup.invalidLibrary');
        const ids = new Set();
        const paths = new Set();
        const backups = parsed.backups.map(function (value) {
            const item = record(value);
            if (ids.has(item.id) || (item.path && paths.has(item.path))) throw error('backup.invalidLibrary');
            ids.add(item.id);
            if (item.path) paths.add(item.path);
            return item;
        });
        return { version: 1, backups: backups };
    }
    function bounded(library) {
        if (encoder.encode(JSON.stringify(library)).length > MAX_LIBRARY_BYTES) throw error('backup.libraryTooLarge', { max: 20 });
        return library;
    }
    function append(library, value) {
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
        return next;
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
                return normalizeLibrary(JSON.parse(raw));
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
            const next = append(library, value);
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

    function createPersistentLibrary(options) {
        options = options || {};
        let storage = options.storage;
        if (storage === undefined) { try { storage = root.localStorage || null; } catch (_) { storage = null; } }
        const legacy = createLibrary(storage);
        const database = options.database || Storage && Storage.createDatabase({ indexedDB: options.indexedDB, name: options.databaseName });
        let currentStatus = { backend: 'opening', warningKey: '', readOnly: false };
        let channel;
        const listeners = new Set();
        function status(next) {
            if (next) {
                currentStatus = next;
                try { if (typeof options.onStatus === 'function') options.onStatus(Object.assign({}, next)); } catch (_) { /* A view callback cannot change storage outcomes. */ }
            }
            return Object.assign({}, currentStatus);
        }
        function notify() { listeners.forEach(function (listener) { try { listener(); } catch (_) { /* Subscriber errors cannot roll back a committed save. */ } }); }
        function changed() {
            notify();
            try { if (channel) channel.postMessage('changed'); } catch (_) { /* The library may have been closed after commit. */ }
            try { if (storage) storage.setItem(CHANGE_KEY, String(Date.now()) + '-' + Math.random()); } catch (_) { /* Notification is best effort; database remains authoritative. */ }
        }
        try {
            if (typeof root.BroadcastChannel === 'function') {
                channel = new root.BroadcastChannel('evportal-backups-v1');
                channel.onmessage = notify;
                // Node unit tests must not be kept alive by a notification channel.
                if (typeof channel.unref === 'function') channel.unref();
            }
        } catch (_) { channel = null; }
        function storageChanged(event) { if (event.key === CHANGE_KEY || event.key === STORAGE_KEY || event.key === null) notify(); }
        if (root.addEventListener) root.addEventListener('storage', storageChanged);
        function fallback() {
            let migrated = true;
            try { migrated = !storage || Boolean(storage.getItem(MIGRATION_KEY)); } catch (_) { /* Unknown history must not replace a newer database. */ }
            // localStorage has no atomic read/modify/write transaction across
            // tabs. Keep recovery available without risking competing writes.
            return status({ backend: 'localstorage', warningKey: migrated ? 'backup.storageRecoveryOnly' : 'backup.storageFallback', readOnly: true });
        }
        const ready = (async function () {
            try { if (!database) throw error('backup.storageUnavailable'); await database.open(); }
            catch (_) { return fallback(); }
            async function migrate() {
                try {
                    // Set the guard before creating persistent records. If a later
                    // boot cannot open IndexedDB, an older legacy copy is read-only.
                    if (storage) storage.setItem(MIGRATION_KEY, '1');
                } catch (_) { return status({ backend: 'localstorage', warningKey: 'backup.storageRecoveryOnly', readOnly: true }); }
                await database.update(STORAGE_KEY, function (existing) {
                    const library = existing === undefined ? { version: 1, backups: legacy.list().reverse() } : normalizeLibrary(existing);
                    return { value: bounded(library), result: null };
                });
                // Verify the committed value through a separate transaction. Keep
                // the original localStorage entry unchanged even after this succeeds.
                normalizeLibrary(await database.read(STORAGE_KEY));
                return status({ backend: 'indexeddb', warningKey: '', readOnly: false });
            }
            return migrate();
        }()).catch(function (issue) {
            if (!issue.i18nKey || issue.i18nKey === 'backup.storageUnavailable') return fallback();
            status({ backend: 'unavailable', warningKey: issue.i18nKey || 'backup.storageUnavailable', readOnly: true });
            throw issue;
        });
        // Creation is eager, but callers may not open the backup dialog yet.
        // Attach a rejection handler immediately; operations still reject.
        ready.catch(function () {});
        async function read() {
            await ready;
            if (currentStatus.backend === 'localstorage') return { version: 1, backups: legacy.list().reverse() };
            return normalizeLibrary(await database.read(STORAGE_KEY));
        }
        async function mutate(operation) {
            await ready;
            if (currentStatus.readOnly) throw error('backup.storageUnavailable');
            const result = await database.update(STORAGE_KEY, function (existing) {
                const library = normalizeLibrary(existing);
                const answer = operation(library);
                return { value: bounded(library), result: answer };
            });
            changed();
            return result;
        }
        return {
            ready: ready,
            status: function () { return status(); },
            list: async function () { return (await read()).backups.reverse().sort(function (a, b) { return b.createdAt - a.createdAt; }); },
            get: async function (id) {
                if (!validID(id)) throw error('backup.invalidBackup');
                return (await read()).backups.find(function (item) { return item.id === id; }) || null;
            },
            add: function (value) { return mutate(function (library) { return append(library, value); }); },
            remove: async function (id) {
                if (!validID(id)) throw error('backup.invalidBackup');
                return mutate(function (library) {
                    const before = library.backups.length;
                    library.backups = library.backups.filter(function (item) { return item.id !== id; });
                    return before !== library.backups.length;
                });
            },
            subscribe: function (listener) { listeners.add(listener); return function () { listeners.delete(listener); }; },
            close: function () {
                if (channel) channel.close();
                if (root.removeEventListener) root.removeEventListener('storage', storageChanged);
                if (database) database.close();
                listeners.clear();
            }
        };
    }

    return { STORAGE_KEY: STORAGE_KEY, MIGRATION_KEY: MIGRATION_KEY, CHANGE_KEY: CHANGE_KEY, MAX_BACKUPS: MAX_BACKUPS,
        MAX_TITLE_LENGTH: MAX_TITLE_LENGTH, MAX_LIBRARY_BYTES: MAX_LIBRARY_BYTES, SOURCES: SOURCES,
        createLibrary: createLibrary, createPersistentLibrary: createPersistentLibrary };
}));
