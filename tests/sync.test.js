'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const Sync = require('../js/sync.js');
const { createDevServer } = require('../sync/dev.cjs');
const ORIGIN = 'http://127.0.0.1:4187';
const snapshot = name => ({ version: 1, portal: { theme: 'dark', categories: [{ id: 'favorites', label: name, shortcuts: [] }] }, preferences: { contentLanguages: ['fr', 'en'], preferredCountries: ['FR', 'GB'] } });
function storage() { const map = new Map(); return { getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key), map }; }
function client(endpoint, saved, inspect) { return Sync.createClient({ endpoint, storage: saved || null, fetch: async (url, options) => { if (inspect) inspect(url, options); return fetch(url, { ...options, headers: { ...options.headers, Origin: ORIGIN } }); } }); }
async function stop(server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }

test('encrypted two-device sync rejects stale writes, survives restart and revokes all holders on deletion', async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'evportal-sync-'));
    const store = path.join(directory, 'store.json');
    let server = await createDevServer({ port: 0, store, origins: [ORIGIN] });
    t.after(async () => { if (server.listening) await stop(server); await fs.rm(directory, { recursive: true }); });
    const endpoint = 'http://127.0.0.1:' + server.address().port;
    const saved = storage();
    const observed = [];
    const first = client(endpoint, saved, (url, options) => observed.push({ url, options }));
    assert.equal(first.status().connected, false);
    const original = snapshot('Famille 🚘');
    const created = await first.create(original, { remember: true });
    assert.match(created.recoveryCode, /^EV1\.[A-Za-z0-9_-]{43}$/);
    assert.equal(created.revision, 1);
    const second = client(endpoint);
    assert.deepEqual((await second.connect(created.recoveryCode)).snapshot, original);
    assert.equal(second.status().remembered, false);
    assert.equal(saved.map.size, 1);
    const updated = snapshot('Nouvelle configuration');
    assert.equal((await first.save(updated)).revision, 2);
    for (let i = 0; i < 2; i++) await assert.rejects(second.save(snapshot('Ne doit pas remplacer')), error => error.code === 'CONFLICT' && error.remoteRevision === 2);
    assert.equal(second.status().revision, 1);
    assert.deepEqual((await second.load()).snapshot, updated);
    assert.equal((await second.save(snapshot('Après résolution explicite'))).revision, 3);
    const disk = await fs.readFile(store, 'utf8');
    assert.doesNotMatch(disk, /Nouvelle configuration|Après résolution|Famille|recoveryCode/);
    assert.ok(!disk.includes(created.recoveryCode.slice(4)));
    assert.ok(!disk.includes(observed[0].options.headers.Authorization.slice(7)));
    for (const request of observed) {
        assert.ok(!request.url.includes('?'));
        assert.ok(!JSON.stringify(request).includes(created.recoveryCode));
        assert.equal(request.options.credentials, 'omit');
        assert.equal(request.options.referrerPolicy, 'no-referrer');
    }
    const port = server.address().port;
    await stop(server);
    server = await createDevServer({ port, store, origins: [ORIGIN] });
    const restored = client(endpoint, saved);
    assert.equal(restored.status().connected, true);
    assert.equal(restored.getRecoveryCode(), created.recoveryCode);
    assert.equal((await restored.load()).revision, 3);
    await restored.deleteProfile();
    assert.equal(restored.status().connected, false);
    assert.equal(saved.getItem(Sync.STORAGE_KEY), null);
    await assert.rejects(second.load(), error => error.code === 'UNAUTHORIZED');
    assert.deepEqual(JSON.parse(await fs.readFile(store, 'utf8')).profiles, []);
    const oldCreate = observed[0];
    assert.equal((await fetch(oldCreate.url, { ...oldCreate.options, headers: { ...oldCreate.options.headers, Origin: ORIGIN } })).status, 409, 'deleted recovery codes cannot re-create their old profile');
});

test('simultaneous devices use compare-and-swap: exactly one write succeeds', async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'evportal-sync-race-'));
    const server = await createDevServer({ port: 0, store: path.join(directory, 'store.json'), origins: [ORIGIN] });
    t.after(async () => { await stop(server); await fs.rm(directory, { recursive: true }); });
    const endpoint = 'http://127.0.0.1:' + server.address().port;
    const first = client(endpoint); const second = client(endpoint);
    const created = await first.create(snapshot('Initiale'));
    await second.connect(created.recoveryCode);
    const results = await Promise.allSettled([first.save(snapshot('A')), second.save(snapshot('B'))]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.find(result => result.status === 'rejected').reason.code, 'CONFLICT');
    const current = await first.load();
    assert.equal(current.revision, 2);
    assert.ok(['A', 'B'].includes(current.snapshot.portal.categories[0].label));
});

test('CORS, authentication, body bounds, malformed input, private routes and encryption integrity', async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'evportal-sync-security-'));
    const store = path.join(directory, 'store.json');
    const server = await createDevServer({ port: 0, store, origins: [ORIGIN] });
    t.after(async () => { await stop(server); await fs.rm(directory, { recursive: true }); });
    const endpoint = 'http://127.0.0.1:' + server.address().port;
    let credentials;
    const owner = client(endpoint, null, (url, options) => { if (url.endsWith('/v1/profiles')) credentials = { id: JSON.parse(options.body).profileId, auth: options.headers.Authorization }; });
    const created = await owner.create(snapshot('Secret'));
    const resource = endpoint + '/v1/profiles/' + credentials.id;
    assert.equal((await fetch(resource, { headers: { Origin: ORIGIN } })).status, 401);
    assert.equal((await fetch(resource, { headers: { Origin: ORIGIN, Authorization: credentials.auth.slice(7) } })).status, 401);
    assert.equal((await fetch(resource, { headers: { Origin: ORIGIN, Authorization: 'Bearer ' + 'A'.repeat(43) } })).status, 401);
    const blocked = await fetch(resource, { headers: { Origin: 'https://untrusted.example', Authorization: credentials.auth } });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.headers.get('Access-Control-Allow-Origin'), null);
    assert.equal((await fetch(endpoint + '/v1/profiles', { headers: { Origin: ORIGIN, Authorization: credentials.auth } })).status, 404);
    const preflight = await fetch(endpoint + '/v1/profiles', { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), ORIGIN);
    const write = body => fetch(resource, { method: 'PUT', headers: { Origin: ORIGIN, Authorization: credentials.auth, 'Content-Type': 'application/json' }, body });
    assert.equal((await write('{')).status, 400);
    assert.equal((await write(JSON.stringify({ baseRevision: 1, envelope: { version: 1, iv: 'bad', ciphertext: 'A'.repeat(22) } }))).status, 400);
    assert.equal((await write('x'.repeat(1024 * 1024 + 1))).status, 413);
    assert.equal((await fetch(resource + '?secret=forbidden', { headers: { Origin: ORIGIN, Authorization: credentials.auth } })).status, 403);
    const data = await (await fetch(resource, { headers: { Origin: ORIGIN, Authorization: credentials.auth } })).json();
    data.envelope.ciphertext = (data.envelope.ciphertext[0] === 'A' ? 'B' : 'A') + data.envelope.ciphertext.slice(1);
    const untrustedServer = Sync.createClient({ endpoint, storage: null, fetch: async () => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } }) });
    await assert.rejects(untrustedServer.connect(created.recoveryCode), error => error.code === 'DECRYPT_FAILED');
    assert.equal(untrustedServer.status().connected, false);
    assert.equal((await owner.load()).snapshot.portal.categories[0].label, 'Secret');
});

test('client is opt-in, enforces limits and never replaces a connected profile on failed connection', async () => {
    let calls = 0;
    const disabled = Sync.createClient({ endpoint: '', storage: null, fetch: () => { calls++; } });
    assert.equal(disabled.status().available, false);
    await assert.rejects(disabled.create(snapshot('x')), error => error.code === 'UNAVAILABLE');
    assert.equal(calls, 0);
    assert.throws(() => Sync.createClient({ endpoint: 'http://public.example', storage: null }), error => error.code === 'INVALID_ENDPOINT');
    assert.throws(() => Sync.createClient({ endpoint: 'https://host.example/?token=secret', storage: null }), error => error.code === 'INVALID_ENDPOINT');
    const available = Sync.createClient({ endpoint: 'https://sync.example', storage: null, fetch: () => { calls++; throw new Error(); } });
    await assert.rejects(available.connect('EV1.bad'), error => error.code === 'INVALID_CODE');
    await assert.rejects(available.create({ huge: 'x'.repeat(Sync.MAX_SNAPSHOT_BYTES) }), error => error.code === 'TOO_LARGE');
    assert.equal(calls, 0);
});

test('a failed join preserves the current identity and blocked forgetting is reported honestly', async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'evportal-sync-storage-'));
    const server = await createDevServer({ port: 0, store: path.join(directory, 'store.json'), origins: [ORIGIN] });
    t.after(async () => { await stop(server); await fs.rm(directory, { recursive: true }); });
    const saved = storage();
    const owner = client('http://127.0.0.1:' + server.address().port, saved);
    const created = await owner.create(snapshot('Protected local identity'), { remember: true });
    await assert.rejects(owner.connect('EV1.' + 'A'.repeat(43)), error => error.code === 'UNAUTHORIZED');
    assert.equal(owner.getRecoveryCode(), created.recoveryCode);
    assert.equal(owner.status().revision, 1);
    saved.removeItem = () => { throw new Error('Browser storage blocked'); };
    assert.throws(() => owner.disconnect(), error => error.code === 'STORAGE_UNAVAILABLE');
    assert.equal(owner.status().connected, false);
    assert.equal(owner.status().storageWarning, true);
    assert.ok(saved.getItem(Sync.STORAGE_KEY), 'the caller must be warned that a browser copy remains');
});

test('local creation throttling and corrupted persistent stores fail safely', async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'evportal-sync-limit-'));
    const store = path.join(directory, 'store.json');
    const server = await createDevServer({ port: 0, store, origins: [ORIGIN], limits: { createLimit: 1 } });
    t.after(async () => { if (server.listening) await stop(server); await fs.rm(directory, { recursive: true }); });
    const endpoint = 'http://127.0.0.1:' + server.address().port;
    await client(endpoint).create(snapshot('One'));
    await assert.rejects(client(endpoint).create(snapshot('Two')), error => error.code === 'RATE_LIMITED');
    await stop(server);
    await fs.writeFile(store, '{corrupt');
    await assert.rejects(createDevServer({ port: 0, store, origins: [ORIGIN] }), /conservé/);
    assert.equal(await fs.readFile(store, 'utf8'), '{corrupt');
});

test('production D1 SQL adapter executes create, compare-and-swap and deletion against real SQLite', async () => {
    const { DatabaseSync } = require('node:sqlite');
    const { d1Repository } = await import('../sync/worker.mjs');
    const db = new DatabaseSync(':memory:');
    db.exec(await fs.readFile(path.join(__dirname, '../sync/schema.sql'), 'utf8'));
    const d1 = { prepare(sql) { return { bind(...values) { const statement = db.prepare(sql); return { first: async () => statement.get(...values), run: async () => ({ meta: { changes: Number(statement.run(...values).changes) } }) }; } }; }, async batch(statements) { db.exec('BEGIN'); try { const results = []; for (const statement of statements) results.push(await statement.run()); db.exec('COMMIT'); return results; } catch (error) { db.exec('ROLLBACK'); throw error; } } };
    const repo = d1Repository(d1);
    const record = { id: 'A'.repeat(22), tokenHash: 'b'.repeat(64), revision: 1, updatedAt: 100, envelope: { version: 1, iv: 'c'.repeat(16), ciphertext: 'd'.repeat(22) } };
    assert.equal(await repo.create(record), true);
    assert.equal(await repo.create(record), false);
    assert.deepEqual(await repo.get(record.id), record);
    assert.equal(await repo.update(record.id, record.tokenHash, 1, record.envelope, 200), true);
    assert.equal(await repo.update(record.id, record.tokenHash, 1, record.envelope, 300), false);
    assert.equal((await repo.get(record.id)).revision, 2);
    await repo.remove(record.id, 'wrong');
    assert.ok(await repo.get(record.id));
    await repo.remove(record.id, record.tokenHash);
    assert.equal(await repo.get(record.id), null);
    assert.equal(await repo.create(record), false);
    db.close();
});

test('real browser tabs forget remembered identities and cannot revive credentials from stale requests', async t => {
    const { chromium } = require('playwright');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'evportal-sync-browser-'));
    const app = http.createServer((request, response) => {
        response.writeHead(200, { 'Content-Type': 'text/html' });
        response.end('<!doctype html><title>Private sync lifecycle test</title>');
    });
    await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + app.address().port;
    const api = await createDevServer({ port: 0, store: path.join(directory, 'store.json'), origins: [origin], limits: { createLimit: 50 } });
    const endpoint = 'http://127.0.0.1:' + api.address().port;
    let browser;
    try {
        try { browser = await chromium.launch({ headless: true }); }
        catch (issue) { if (process.platform !== 'win32') throw issue; browser = await chromium.launch({ headless: true, channel: 'msedge' }); }
        async function pageIn(context) {
            const page = await context.newPage();
            await page.goto(origin);
            await page.addScriptTag({ path: path.join(__dirname, '../js/sync.js') });
            return page;
        }
        async function isolated(run) {
            const context = await browser.newContext();
            try { await run(context, await pageIn(context)); }
            finally { await context.close(); }
        }
        await t.test('logout clears loaded memory and a remembered record in other tabs, with no resurrection after reload', async () => isolated(async (context, owner) => {
            const code = await owner.evaluate(async endpoint => {
                window.client = EVSync.createClient({ endpoint });
                return (await client.create({ label: 'Synthetic private shortcuts' }, { remember: true })).recoveryCode;
            }, endpoint);
            const remembered = await pageIn(context);
            const loaded = await pageIn(context);
            for (const page of [remembered, loaded]) await page.evaluate(endpoint => { window.client = EVSync.createClient({ endpoint }); }, endpoint);
            await loaded.evaluate(() => client.load());
            // A different storage area must never invalidate this client's identity.
            await loaded.evaluate(() => dispatchEvent(new StorageEvent('storage', { key: EVSync.STORAGE_KEY, newValue: null, storageArea: sessionStorage })));
            assert.equal(await loaded.evaluate(() => client.status().connected), true);
            await owner.evaluate(() => client.disconnect());
            for (const page of [remembered, loaded]) {
                await page.waitForFunction(() => !client.status().connected);
                assert.deepEqual(await page.evaluate(() => ({ code: client.getRecoveryCode(), stored: localStorage.getItem(EVSync.STORAGE_KEY) })), { code: '', stored: null });
                assert.equal(await page.evaluate(async () => { try { await client.load(); } catch (issue) { return issue.code; } }), 'NOT_CONNECTED');
            }
            await remembered.reload();
            await remembered.addScriptTag({ path: path.join(__dirname, '../js/sync.js') });
            assert.equal(await remembered.evaluate(endpoint => EVSync.createClient({ endpoint }).status().connected, endpoint), false);
            await owner.evaluate(async ({ endpoint, code }) => { const cleanup = EVSync.createClient({ endpoint, storage: null }); await cleanup.connect(code); await cleanup.deleteProfile(); cleanup.close(); }, { endpoint, code });
        }));
        await t.test('clearing local storage invalidates other tabs while a sibling save preserves conflict detection', async () => isolated(async (context, owner) => {
            const code = await owner.evaluate(async endpoint => {
                window.client = EVSync.createClient({ endpoint });
                return (await client.create({ label: 'Initial' }, { remember: true })).recoveryCode;
            }, endpoint);
            const peer = await pageIn(context);
            await peer.evaluate(endpoint => { window.client = EVSync.createClient({ endpoint }); }, endpoint);
            await peer.evaluate(() => client.load());
            await owner.evaluate(() => client.save({ label: 'New remote version' }));
            await peer.waitForFunction(() => JSON.parse(localStorage.getItem(EVSync.STORAGE_KEY)).revision === 2);
            assert.equal(await peer.evaluate(() => client.status().revision), 1, 'A sibling save must not silently advance an unmerged base revision');
            assert.equal(await peer.evaluate(async () => { try { await client.save({ label: 'Stale' }); } catch (issue) { return issue.code; } }), 'CONFLICT');
            await owner.evaluate(() => localStorage.clear());
            await peer.waitForFunction(() => !client.status().connected);
            assert.equal(await peer.evaluate(() => client.getRecoveryCode()), '');
            await owner.evaluate(async ({ endpoint, code }) => { const cleanup = EVSync.createClient({ endpoint, storage: null }); await cleanup.connect(code); await cleanup.deleteProfile(); cleanup.close(); }, { endpoint, code });
        }));
        await t.test('disconnect also invalidates session-only tabs when no recovery code was remembered', async () => isolated(async (context, owner) => {
            const code = await owner.evaluate(async endpoint => {
                window.client = EVSync.createClient({ endpoint });
                return (await client.create({ label: 'Session only' }, { remember: false })).recoveryCode;
            }, endpoint);
            const peer = await pageIn(context);
            await peer.evaluate(async ({ endpoint, code }) => { window.client = EVSync.createClient({ endpoint }); await client.connect(code, { remember: false }); }, { endpoint, code });
            assert.equal(await peer.evaluate(() => localStorage.getItem(EVSync.STORAGE_KEY)), null);
            await owner.evaluate(() => client.disconnect());
            await peer.waitForFunction(() => !client.status().connected);
            assert.equal(await peer.evaluate(() => client.getRecoveryCode()), '');
            await owner.evaluate(async ({ endpoint, code }) => { const cleanup = EVSync.createClient({ endpoint, storage: null }); await cleanup.connect(code); await cleanup.deleteProfile(); cleanup.close(); }, { endpoint, code });
        }));
        for (const operation of ['create', 'connect', 'load', 'save']) {
            await t.test('logout wins over an in-flight ' + operation + ' response even when the fetch wrapper ignores abort', async () => isolated(async (context, owner) => {
                const code = await owner.evaluate(async endpoint => {
                    window.client = EVSync.createClient({ endpoint });
                    return (await client.create({ label: 'Initial synthetic data' }, { remember: true })).recoveryCode;
                }, endpoint);
                const peer = await pageIn(context);
                await peer.evaluate(({ endpoint, code, operation }) => {
                    window.auditResponseReady = false;
                    window.auditCleanup = null;
                    let release;
                    const gate = new Promise(resolve => { release = resolve; });
                    window.releaseAuditResponse = release;
                    window.client = EVSync.createClient({ endpoint, fetch: async (url, settings) => {
                        const response = await fetch(url, settings);
                        const body = await response.arrayBuffer();
                        const responseOptions = { status: response.status, headers: Object.fromEntries(response.headers) };
                        if (operation === 'create') window.auditCleanup = { url: endpoint + '/v1/profiles/' + JSON.parse(settings.body).profileId, authorization: settings.headers.Authorization };
                        window.auditResponseReady = true;
                        await gate;
                        // A fully buffered synthetic Response deliberately ignores
                        // the original AbortSignal, so generation checks are required.
                        return new Response(body, responseOptions);
                    } });
                    const pending = operation === 'create' ? client.create({ label: 'New profile' }, { remember: true })
                        : operation === 'connect' ? client.connect(code, { remember: true })
                        : operation === 'load' ? client.load() : client.save({ label: 'A write before logout' });
                    window.auditOutcome = pending.then(() => 'unexpected-success', issue => issue.code);
                }, { endpoint, code, operation });
                await peer.waitForFunction(() => auditResponseReady);
                await owner.evaluate(() => client.disconnect());
                await peer.waitForFunction(() => !client.status().connected);
                const result = await peer.evaluate(async () => {
                    releaseAuditResponse();
                    const outcome = await auditOutcome;
                    return { outcome, connected: client.status().connected, code: client.getRecoveryCode(), stored: localStorage.getItem(EVSync.STORAGE_KEY) };
                });
                assert.deepEqual(result, { outcome: 'SESSION_CHANGED', connected: false, code: '', stored: null });
                // A server may already have committed an HTTP operation before
                // logout. Remove only the synthetic profile created by this test.
                if (operation === 'create') await peer.evaluate(async () => {
                    await fetch(auditCleanup.url, { method: 'DELETE', headers: { Authorization: auditCleanup.authorization } });
                    auditCleanup = null;
                });
                await owner.evaluate(async ({ endpoint, code }) => { const cleanup = EVSync.createClient({ endpoint, storage: null }); await cleanup.connect(code); await cleanup.deleteProfile(); cleanup.close(); }, { endpoint, code });
            }));
        }
        await t.test('close releases the listener and invalidates only that client memory', async () => isolated(async (context, page) => {
            const result = await page.evaluate(async endpoint => {
                const client = EVSync.createClient({ endpoint });
                const created = await client.create({ label: 'Synthetic close test' }, { remember: true });
                client.close();
                const result = { connected: client.status().connected, available: client.status().available, code: client.getRecoveryCode(), remembered: Boolean(localStorage.getItem(EVSync.STORAGE_KEY)) };
                const cleanup = EVSync.createClient({ endpoint, storage: null }); await cleanup.connect(created.recoveryCode); await cleanup.deleteProfile(); cleanup.close();
                return result;
            }, endpoint);
            assert.deepEqual(result, { connected: false, available: false, code: '', remembered: true });
        }));
    } finally {
        if (browser) await browser.close();
        await stop(api);
        await new Promise(resolve => app.close(resolve));
        await fs.rm(directory, { recursive: true });
    }
});
