/* Real Worker/D1 emulation; never opens a Cloudflare account or remote database. */
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const Sync = require('../js/sync.js');
let Miniflare;
let convertV4MiniflareOptions;
try { ({ Miniflare, convertV4MiniflareOptions } = require('miniflare')); }
catch (_) { ({ Miniflare, convertV4MiniflareOptions } = require('../relay/node_modules/miniflare')); }
async function main() {
    const origin = 'http://127.0.0.1:4187';
    const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: 'evportal-sync-test', modules: ['worker.mjs', 'handler.mjs'].map(name => ({ type: 'ESModule', path: path.join(__dirname, name) })), d1Databases: ['DB'], bindings: { ALLOWED_ORIGINS: origin, SYNC_ENABLED: 'true' }, compatibilityDate: '2026-09-01' }] }));
    try {
        const db = await mf.getD1Database('DB');
        const schema = (await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8')).replace(/^--.*$/gm, '');
        for (const statement of schema.split(';').map(value => value.trim()).filter(Boolean)) await db.prepare(statement).run();
        const makeClient = () => Sync.createClient({ endpoint: 'http://127.0.0.1:4399', storage: null, fetch: (url, options) => mf.dispatchFetch(url, { ...options, headers: { ...options.headers, Origin: origin } }) });
        const a = makeClient(); const b = makeClient();
        const profile = await a.create({ title: 'Worker D1 local' });
        assert.equal((await b.connect(profile.recoveryCode)).snapshot.title, 'Worker D1 local');
        await a.save({ title: 'New revision' });
        await assert.rejects(b.save({ title: 'Stale revision' }), error => error.code === 'CONFLICT');
        assert.equal((await b.load()).snapshot.title, 'New revision');
        await a.deleteProfile();
        await assert.rejects(b.load(), error => error.code === 'UNAUTHORIZED');
        const remaining = await db.prepare('SELECT COUNT(*) AS total FROM profiles').first();
        const revoked = await db.prepare('SELECT COUNT(*) AS total FROM revoked_profiles').first();
        assert.equal(remaining.total, 0);
        assert.equal(revoked.total, 1);
        console.log('PASS: actual Worker module with local D1 emulation, encrypted create/join, conditional update conflict and atomic deletion/revocation. No remote account or database used.');
    } finally { await mf.dispose(); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
