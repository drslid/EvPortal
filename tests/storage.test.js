'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

test('persistent backup storage uses real browser transactions and preserves recovery data', async t => {
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<!doctype html><title>Storage test</title>');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        try { browser = await chromium.launch({ headless: true, ...(process.env.EVPORTAL_TEST_BROWSER_CHANNEL ? { channel: process.env.EVPORTAL_TEST_BROWSER_CHANNEL } : {}) }); }
        catch (issue) {
            if (process.platform !== 'win32' || process.env.EVPORTAL_TEST_BROWSER_CHANNEL) throw issue;
            browser = await chromium.launch({ headless: true, channel: 'msedge' });
        }
        const url = 'http://127.0.0.1:' + server.address().port;
        async function pageIn(context) {
            const page = await context.newPage();
            await page.goto(url);
            for (const file of ['state.js', 'storage.js', 'backups.js']) await page.addScriptTag({ path: path.join(__dirname, '..', 'js', file) });
            await page.evaluate(() => {
                window.makeState = name => EVState.normalizeState({ version: 2, categories: [{ id: 'personal', label: 'Liens', shortcuts: [
                    { id: 'link-a', name: name || 'Mon lien', url: 'https://example.org/' }
                ] }] });
            });
            return page;
        }
        async function isolated(run) {
            const context = await browser.newContext();
            try { await run(await pageIn(context), context); }
            finally { await context.close(); }
        }
        await t.test('migration commits, reads back, and leaves the source and active portal untouched', async () => isolated(async page => {
            const result = await page.evaluate(async () => {
                localStorage.setItem(EVState.STORAGE_KEY, 'active-portal');
                const initial = EVBackups.createLibrary(localStorage).add({ title: 'Avant migration', source: 'file', state: makeState() });
                const raw = localStorage.getItem(EVBackups.STORAGE_KEY);
                const library = EVBackups.createPersistentLibrary();
                await library.ready;
                const migrated = await library.get(initial.id);
                const added = await library.add({ title: 'Dans la base', source: 'transfer', state: makeState('Nouveau') });
                await library.remove(initial.id);
                const status = library.status();
                library.close();
                const reopened = EVBackups.createPersistentLibrary();
                await reopened.ready;
                return { status, initial, migrated, added, records: await reopened.list(), legacy: localStorage.getItem(EVBackups.STORAGE_KEY), raw, active: localStorage.getItem(EVState.STORAGE_KEY) };
            });
            assert.equal(result.status.backend, 'indexeddb');
            assert.deepEqual(result.initial, result.migrated);
            assert.deepEqual(result.records, [result.added]);
            assert.equal(result.raw, result.legacy);
            assert.equal(result.active, 'active-portal');
        }));
        await t.test('simultaneous additions from separate tabs do not overwrite one another', async () => isolated(async (first, context) => {
            const second = await pageIn(context);
            for (const page of [first, second]) await page.evaluate(async () => { window.library = EVBackups.createPersistentLibrary(); await library.ready; });
            await Promise.all([first, second].map((page, tab) => page.evaluate(async tab => {
                await Promise.all(Array.from({ length: 12 }, (_, index) => library.add({ title: tab + '-' + index, source: 'file', state: makeState() })));
            }, tab)));
            const records = await first.evaluate(async () => (await library.list()).map(item => item.title));
            assert.equal(records.length, 24);
            assert.equal(new Set(records).size, 24);
            const shared = await Promise.all([first, second].map(page => page.evaluate(() => library.add({ title: 'Commun', path: 'one-page', source: 'link', state: makeState() }))));
            assert.equal(shared[0].id, shared[1].id);
            assert.equal(await first.evaluate(async () => (await library.list()).length), 25);
        }));
        await t.test('a real transaction abort preserves its previous committed library and permits retry', async () => isolated(async page => {
            const result = await page.evaluate(async () => {
                const library = EVBackups.createPersistentLibrary(); await library.ready;
                const first = await library.add({ title: 'Conservée', source: 'file', state: makeState() });
                const original = IDBObjectStore.prototype.put;
                IDBObjectStore.prototype.put = function () { throw new DOMException('Full', 'QuotaExceededError'); };
                let failure;
                try { await library.add({ title: 'Ne doit pas apparaître', source: 'file', state: makeState() }); }
                catch (issue) { failure = issue.i18nKey; }
                finally { IDBObjectStore.prototype.put = original; }
                const afterFailure = await library.list();
                await library.add({ title: 'Nouvel essai', source: 'file', state: makeState() });
                return { first, failure, afterFailure, count: (await library.list()).length };
            });
            assert.equal(result.failure, 'backup.storageUnavailable');
            assert.deepEqual(result.afterFailure, [result.first]);
            assert.equal(result.count, 2);
        }));
        await t.test('failed migration retains all legacy bytes and never creates a replacement library', async () => isolated(async page => {
            const result = await page.evaluate(async () => {
                const raw = '{invalid'; localStorage.setItem(EVBackups.STORAGE_KEY, raw);
                const library = EVBackups.createPersistentLibrary();
                let failure;
                try { await library.ready; } catch (issue) { failure = issue.i18nKey; }
                const database = EVStorage.createDatabase();
                return { failure, raw: localStorage.getItem(EVBackups.STORAGE_KEY), stored: await database.read(EVBackups.STORAGE_KEY), status: library.status() };
            });
            assert.equal(result.failure, 'backup.invalidLibrary');
            assert.equal(result.raw, '{invalid');
            assert.equal(result.stored, undefined);
            assert.equal(result.status.readOnly, true);
        }));
        await t.test('IndexedDB failure during migration exposes the preserved fallback as read only', async () => isolated(async page => {
            const result = await page.evaluate(async () => {
                const initial = EVBackups.createLibrary(localStorage).add({ title: 'Avant', source: 'file', state: makeState() });
                const raw = localStorage.getItem(EVBackups.STORAGE_KEY);
                const original = IDBObjectStore.prototype.put;
                IDBObjectStore.prototype.put = function () { throw new DOMException('Full', 'QuotaExceededError'); };
                const library = EVBackups.createPersistentLibrary();
                try { await library.ready; } finally { IDBObjectStore.prototype.put = original; }
                let failure;
                try { await library.remove(initial.id); } catch (issue) { failure = issue.i18nKey; }
                return { status: library.status(), records: await library.list(), initial, raw, after: localStorage.getItem(EVBackups.STORAGE_KEY), failure };
            });
            assert.equal(result.status.backend, 'localstorage');
            assert.equal(result.status.warningKey, 'backup.storageRecoveryOnly');
            assert.equal(result.status.readOnly, true);
            assert.deepEqual(result.records, [result.initial]);
            assert.equal(result.failure, 'backup.storageUnavailable');
            assert.equal(result.raw, result.after);
        }));
        await t.test('fallback stays readable and cannot overwrite saved data with concurrent changes', async () => isolated(async (first, context) => {
            const second = await pageIn(context);
            await first.evaluate(() => EVBackups.createLibrary(localStorage).add({ title: 'Conservée', source: 'file', state: makeState() }));
            for (const page of [first, second]) await page.evaluate(async () => { window.library = EVBackups.createPersistentLibrary({ indexedDB: null }); await library.ready; });
            const failures = await Promise.all([first, second].map((page, tab) => page.evaluate(async tab => {
                try { await library.add({ title: tab + '-nouvelle', source: 'file', state: makeState() }); return ''; }
                catch (issue) { return issue.i18nKey; }
            }, tab)));
            assert.deepEqual(failures, ['backup.storageUnavailable', 'backup.storageUnavailable']);
            const result = await first.evaluate(async () => {
                const count = (await library.list()).length;
                const normalStatus = library.status();
                localStorage.setItem(EVBackups.MIGRATION_KEY, '1');
                const recovery = EVBackups.createPersistentLibrary({ indexedDB: null }); await recovery.ready;
                let failure;
                try { await recovery.add({ title: 'Interdite', source: 'file', state: makeState() }); } catch (issue) { failure = issue.i18nKey; }
                const noStorage = EVBackups.createPersistentLibrary({ indexedDB: null, storage: null }); await noStorage.ready;
                let storageFailure;
                try { await noStorage.list(); } catch (issue) { storageFailure = issue.i18nKey; }
                return { count, normalStatus, recoveryStatus: recovery.status(), noStorage: noStorage.status(), storageFailure, failure, after: (await library.list()).length };
            });
            assert.equal(result.count, 1);
            assert.equal(result.after, 1);
            assert.equal(result.normalStatus.warningKey, 'backup.storageFallback');
            assert.equal(result.normalStatus.readOnly, true);
            assert.equal(result.recoveryStatus.readOnly, true);
            assert.equal(result.noStorage.readOnly, true);
            assert.equal(result.storageFailure, 'backup.storageUnavailable');
            assert.equal(result.failure, 'backup.storageUnavailable');
        }));
        await t.test('an existing fallback cannot write over a library migrated by another tab', async () => isolated(async (first, context) => {
            const second = await pageIn(context);
            await first.evaluate(async () => {
                EVBackups.createLibrary(localStorage).add({ title: 'Dans le secours', source: 'file', state: makeState() });
                window.library = EVBackups.createPersistentLibrary({ indexedDB: null }); await library.ready;
            });
            await second.evaluate(async () => { window.library = EVBackups.createPersistentLibrary(); await library.ready; });
            const rejected = await first.evaluate(async () => {
                try { await library.add({ title: 'Après migration', source: 'file', state: makeState() }); return ''; }
                catch (issue) { return issue.i18nKey; }
            });
            assert.equal(rejected, 'backup.storageUnavailable');
            assert.equal(await first.evaluate(() => library.status().readOnly), true);
            assert.deepEqual(await second.evaluate(async () => (await library.list()).map(item => item.title)), ['Dans le secours']);
        }));
        await t.test('the aggregate size limit aborts atomically before a library grows beyond 20 MiB', async () => isolated(async page => {
            const result = await page.evaluate(async () => {
                const state = EVState.normalizeState({ version: 2, categories: [{ id: 'personal', label: 'Liens', shortcuts: Array.from({ length: 1000 }, (_, index) => ({
                    id: 'link-' + index, name: 'Lien ' + index, url: 'https://example.org/' + 'a'.repeat(1000) + index, description: 'b'.repeat(300)
                })) }] });
                const one = { id: 'backup-seed-0', title: 'Grande', source: 'file', createdAt: 1, state };
                const backups = [];
                const size = value => new TextEncoder().encode(JSON.stringify(value)).length;
                while (size({ version: 1, backups: backups.concat(one) }) < EVBackups.MAX_LIBRARY_BYTES) backups.push({ ...one, id: 'backup-seed-' + backups.length });
                const database = EVStorage.createDatabase();
                await database.update(EVBackups.STORAGE_KEY, () => ({ value: { version: 1, backups }, result: null }));
                const library = EVBackups.createPersistentLibrary(); await library.ready;
                let failure;
                try { await library.add({ title: 'Trop', source: 'file', state }); } catch (issue) { failure = issue.i18nKey; }
                return { failure, before: backups.length, after: (await library.list()).length, active: localStorage.getItem(EVState.STORAGE_KEY) };
            });
            assert.equal(result.failure, 'backup.libraryTooLarge');
            assert.equal(result.before, result.after);
            assert.equal(result.active, null);
        }));
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
});
