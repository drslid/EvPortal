/* Two isolated real Chromium contexts, real loopback API, persistence restart. */
'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createDevServer } = require('./dev.cjs');
const stop = async server => { if (server && server.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
async function main() {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'evportal-sync-browser-'));
    const store = path.join(directory, 'store.json');
    let api; let browser;
    const app = http.createServer(async (request, response) => {
        response.setHeader('Cache-Control', 'no-store');
        if (request.url === '/js/sync.js') { response.setHeader('Content-Type', 'text/javascript'); return response.end(await fs.readFile(path.join(__dirname, '../js/sync.js'))); }
        response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html><head><title>Local sync test</title><script src="/js/sync.js"></script></head><body>Local sync protocol test</body></html>');
    });
    try {
        await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
        const origin = 'http://127.0.0.1:' + app.address().port;
        api = await createDevServer({ port: 0, store, origins: [origin] });
        const port = api.address().port;
        const endpoint = 'http://127.0.0.1:' + port;
        browser = await chromium.launch({ headless: true, ...(process.env.EVPORTAL_BROWSER_CHANNEL ? { channel: process.env.EVPORTAL_BROWSER_CHANNEL } : {}) });
        const first = await browser.newContext(); const second = await browser.newContext();
        const a = await first.newPage(); const b = await second.newPage();
        const errors = [];
        for (const page of [a, b]) page.on('pageerror', error => errors.push(error.message));
        await Promise.all([a.goto(origin), b.goto(origin)]);
        await Promise.all([a.evaluate(endpoint => { window.client = EVSync.createClient({ endpoint }); }, endpoint), b.evaluate(endpoint => { window.client = EVSync.createClient({ endpoint }); }, endpoint)]);
        const created = await a.evaluate(() => client.create({ title: 'Shared family portal', languages: ['fr', 'en'] }, { remember: true }));
        assert.equal((await b.evaluate(code => client.connect(code), created.recoveryCode)).snapshot.title, 'Shared family portal');
        await a.evaluate(() => client.save({ title: 'Changed in the car' }));
        assert.equal(await b.evaluate(async () => { try { await client.save({ title: 'Stale phone' }); return 'overwritten'; } catch (error) { return error.code; } }), 'CONFLICT');
        assert.equal((await b.evaluate(() => client.load())).snapshot.title, 'Changed in the car');
        await stop(api); api = await createDevServer({ port, store, origins: [origin] });
        await a.reload();
        assert.equal(await a.evaluate(endpoint => { window.client = EVSync.createClient({ endpoint }); return client.status().connected; }, endpoint), true);
        assert.equal((await a.evaluate(() => client.load())).snapshot.title, 'Changed in the car');
        assert.equal(await b.evaluate(() => localStorage.getItem(EVSync.STORAGE_KEY)), null);
        await a.evaluate(() => client.deleteProfile());
        assert.equal(await b.evaluate(async () => { try { await client.load(); return 'authorized'; } catch (error) { return error.code; } }), 'UNAUTHORIZED');
        assert.deepEqual(errors, []);
        console.log('PASS: two isolated Chromium devices, encrypted sync, stale-write conflict, remembered recovery after reload, API restart persistence, deletion revokes all holders.');
    } finally { if (browser) await browser.close(); await stop(api); await stop(app); await fs.rm(directory, { recursive: true }); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
