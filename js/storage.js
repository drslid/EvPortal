/* Small IndexedDB adapter. Read/modify/write stays inside one transaction. */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.EVStorage = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';
    const DATABASE_NAME = 'evportal';
    const STORE_NAME = 'documents';
    function unavailable(cause) {
        const issue = new Error('Persistent storage is unavailable.');
        issue.i18nKey = 'backup.storageUnavailable';
        issue.cause = cause;
        return issue;
    }
    function createDatabase(options) {
        options = options || {};
        let factory;
        try { factory = options.indexedDB === undefined ? root.indexedDB : options.indexedDB; } catch (_) { factory = null; }
        let opening;
        let connection;
        function open() {
            if (opening) return opening;
            opening = new Promise(function (resolve, reject) {
                let request;
                let settled = false;
                const timer = setTimeout(function () { finish(unavailable()); }, options.timeout || 5000);
                function finish(issue, database) {
                    if (settled) { if (database) database.close(); return; }
                    settled = true;
                    clearTimeout(timer);
                    if (issue) reject(issue);
                    else {
                        connection = database;
                        database.onversionchange = function () { database.close(); connection = null; opening = null; };
                        resolve(database);
                    }
                }
                try {
                    if (!factory || typeof factory.open !== 'function') throw new Error('IndexedDB unavailable');
                    request = factory.open(options.name || DATABASE_NAME, 1);
                    request.onupgradeneeded = function () {
                        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
                    };
                    request.onsuccess = function () { finish(null, request.result); };
                    request.onerror = function () { finish(unavailable(request.error)); };
                    request.onblocked = function () { finish(unavailable(request.error)); };
                } catch (issue) { finish(unavailable(issue)); }
            });
            return opening;
        }
        async function transaction(key, update) {
            const database = await open();
            return new Promise(function (resolve, reject) {
                let tx;
                let result;
                let originalIssue;
                try {
                    tx = database.transaction(STORE_NAME, update ? 'readwrite' : 'readonly');
                    const store = tx.objectStore(STORE_NAME);
                    const request = store.get(key);
                    request.onsuccess = function () {
                        try {
                            if (!update) { result = request.result; return; }
                            // update must be synchronous: awaiting here would let
                            // IndexedDB commit before the replacement is queued.
                            const next = update(request.result);
                            if (!next || typeof next !== 'object' || !Object.prototype.hasOwnProperty.call(next, 'value')) throw new Error('Invalid transaction update');
                            result = next.result;
                            store.put(next.value, key);
                        } catch (issue) { originalIssue = issue.i18nKey ? issue : unavailable(issue); tx.abort(); }
                    };
                    tx.oncomplete = function () { resolve(result); };
                    tx.onabort = function () { reject(originalIssue || unavailable(tx.error)); };
                    tx.onerror = function () { /* The abort handler reports the final transaction outcome. */ };
                } catch (issue) { reject(unavailable(issue)); }
            });
        }
        return {
            open: open,
            read: function (key) { return transaction(key); },
            update: transaction,
            close: function () { if (connection) connection.close(); connection = null; opening = null; }
        };
    }
    return { DATABASE_NAME: DATABASE_NAME, STORE_NAME: STORE_NAME, createDatabase: createDatabase };
}));
