'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

test('the cloud Worker is disabled by default before reading any database binding', async () => {
    const { default: worker } = await import('../sync/worker.mjs');
    for (const value of [undefined, 'false', false, true, 'TRUE', '1', ' true ', '']) {
        let databaseTouched = false;
        const env = { SYNC_ENABLED: value, get DB() { databaseTouched = true; throw new Error('Disabled Worker must not access DB.'); } };
        for (const [pathname, method] of [['/health', 'GET'], ['/v1/profiles', 'POST'], ['/v1/profiles', 'OPTIONS']]) {
            const response = await worker.fetch(new Request('https://sync.test' + pathname, { method, headers: { Origin: 'https://drslid.github.io' } }), env);
            assert.equal(response.status, 503);
            assert.equal(response.headers.get('Cache-Control'), 'no-store');
            assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
            assert.deepEqual(await response.json(), { error: 'SYNC_DISABLED' });
        }
        assert.equal(databaseTouched, false);
    }
});

test('only explicit string true opens the Worker; missing infrastructure still fails closed', async () => {
    const { default: worker } = await import('../sync/worker.mjs');
    const missing = await worker.fetch(new Request('https://sync.test/health'), { SYNC_ENABLED: 'true' });
    assert.equal(missing.status, 503);
    assert.equal(await missing.text(), 'Service unavailable');
    let queried = false;
    const env = { SYNC_ENABLED: 'true', ALLOWED_ORIGINS: 'https://drslid.github.io', DB: { prepare() { queried = true; throw new Error('Health must not query DB.'); } } };
    const enabled = await worker.fetch(new Request('https://sync.test/health'), env);
    assert.equal(enabled.status, 200);
    assert.equal((await enabled.json()).service, 'evportal-config-sync');
    assert.equal(queried, false);
});

test('the versioned cloud deployment configuration keeps explicit activation off', async () => {
    const configuration = await fs.readFile(path.join(__dirname, '../sync/wrangler.toml'), 'utf8');
    const variables = /\[vars\]([\s\S]*?)(?=\n\[|$)/.exec(configuration);
    assert.ok(variables);
    assert.match(variables[1], /^SYNC_ENABLED\s*=\s*"false"\s*$/m);
});
