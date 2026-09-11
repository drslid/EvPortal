import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import worker from '../src/worker.js';
import { PairingSession } from '../src/session.js';
import { MAX_BODY_BYTES, MAX_PLAINTEXT_BYTES, SESSION_TTL_MS, readJSON, validatePayload } from '../src/protocol.js';

const ORIGIN = 'https://drslid.github.io';
const payload = { iv: Buffer.alloc(12, 1).toString('base64url'), ciphertext: Buffer.alloc(40, 2).toString('base64url') };
let mf;

before(async () => {
    mf = new Miniflare(convertV4MiniflareOptions({ workers: [{
        name: 'evportal-pairing-relay-test',
        modules: ['worker.js', 'protocol.js', 'session.js'].map(name => ({ type: 'ESModule', path: fileURLToPath(new URL('../src/' + name, import.meta.url)) })),
        compatibilityDate: '2026-07-30',
        bindings: { ALLOWED_ORIGINS: ORIGIN + ',http://127.0.0.1:4187,http://localhost:4187' },
        durableObjects: { PAIRING_SESSIONS: { className: 'PairingSession', useSQLite: true } },
        ratelimits: {
            CREATE_LIMITER: { namespace_id: '87421001', simple: { limit: 1000, period: 60 } },
            REQUEST_LIMITER: { namespace_id: '87421002', simple: { limit: 1000, period: 60 } }
        }
    }] }));
    await mf.ready;
});
after(async () => { if (mf) await mf.dispose(); });

function request(path, method = 'GET', token, body, extraHeaders = {}) {
    return mf.dispatchFetch('http://relay.test' + path, {
        method,
        headers: { Origin: ORIGIN, ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...extraHeaders },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
}

async function session() {
    const response = await request('/v1/sessions', 'POST', undefined, {});
    assert.equal(response.status, 201, response.status === 201 ? '' : await response.text());
    const value = await response.json();
    assert.match(value.id, /^[a-f0-9]{32}$/);
    assert.match(value.receiveToken, /^[a-f0-9]{64}$/);
    assert.match(value.sendToken, /^[a-f0-9]{64}$/);
    assert.notEqual(value.receiveToken, value.sendToken);
    assert.ok(value.expiresAt > Date.now() + SESSION_TTL_MS - 10_000);
    assert.ok(value.expiresAt <= Date.now() + SESSION_TTL_MS);
    return value;
}

test('encrypted transfer runs through the real Worker and SQLite Durable Object, then becomes inaccessible', async () => {
    const item = await session();
    const path = '/v1/sessions/' + item.id;
    const waiting = await request(path, 'GET', item.receiveToken);
    assert.deepEqual(await waiting.json(), { status: 'waiting', expiresAt: item.expiresAt });
    assert.equal((await request(path, 'PUT', item.sendToken, payload)).status, 200);
    const ready = await request(path, 'GET', item.receiveToken);
    assert.deepEqual(await ready.json(), { status: 'ready', expiresAt: item.expiresAt, payload });
    assert.equal(ready.headers.get('Cache-Control'), 'no-store');
    assert.equal((await request(path, 'DELETE', item.receiveToken)).status, 204);
    assert.equal((await request(path, 'GET', item.receiveToken)).status, 410);
    assert.equal((await request(path, 'PUT', item.sendToken, payload)).status, 410);
});

test('send and receive capabilities are separate and cannot access other sessions', async () => {
    const [first, second] = await Promise.all([session(), session()]);
    const path = '/v1/sessions/' + first.id;
    assert.notEqual(first.id, second.id);
    for (const [method, token, body] of [
        ['GET', first.sendToken], ['DELETE', first.sendToken], ['PUT', first.receiveToken, payload],
        ['GET', second.receiveToken], ['PUT', second.sendToken, payload], ['GET', undefined], ['GET', 'x'.repeat(64)]
    ]) assert.equal((await request(path, method, token, body)).status, 401, method);
    assert.deepEqual(await (await request(path, 'GET', first.receiveToken)).json(), { status: 'waiting', expiresAt: first.expiresAt });
});

test('concurrent different deposits permit one winner; identical retries are idempotent and do not extend the expiry', async () => {
    const item = await session();
    const path = '/v1/sessions/' + item.id;
    const alternative = { ...payload, ciphertext: Buffer.alloc(32, 4).toString('base64url') };
    const replies = await Promise.all([request(path, 'PUT', item.sendToken, payload), request(path, 'PUT', item.sendToken, alternative)]);
    assert.deepEqual(replies.map(response => response.status).sort(), [200, 409]);
    const winner = replies[0].status === 200 ? payload : alternative;
    assert.deepEqual(await (await request(path, 'PUT', item.sendToken, winner)).json(), { status: 'sent' });
    const saved = await (await request(path, 'GET', item.receiveToken)).json();
    assert.deepEqual(saved.payload, winner);
    assert.equal(saved.expiresAt, item.expiresAt);
});

test('CORS accepts only exact allowed origins, handles preflights and never grants credentials', async () => {
    for (const origin of [ORIGIN, 'http://127.0.0.1:4187', 'http://localhost:4187']) {
        const response = await request('/v1/sessions', 'OPTIONS', undefined, undefined, { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type, authorization' });
        assert.equal(response.status, 204);
        assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
        assert.equal(response.headers.has('Access-Control-Allow-Credentials'), false);
        assert.equal(response.headers.get('Vary'), 'Origin');
    }
    for (const origin of ['https://drslid.github.io.evil.test', 'https://evil.test', 'null', 'https://drslid.github.io/EvPortal/', 'http://localhost:4188']) {
        const response = await request('/v1/sessions', 'POST', undefined, {}, { Origin: origin });
        assert.equal(response.status, 403);
        assert.equal(response.headers.has('Access-Control-Allow-Origin'), false);
    }
    assert.equal((await mf.dispatchFetch('http://relay.test/v1/sessions', { method: 'POST', body: '{}' })).status, 403);
    const invalid = await request('/v1/sessions', 'OPTIONS', undefined, undefined, { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-custom' });
    assert.equal(invalid.status, 400);
    assert.equal((await mf.dispatchFetch('http://relay.test/health')).status, 200);
});

test('API rejects unsupported routes, query tokens, bodies and JSON types before creating or writing a session', async () => {
    assert.equal((await request('/initialize', 'POST', undefined, {})).status, 404);
    assert.equal((await request('/v1/sessions?token=secret', 'POST', undefined, {})).status, 400);
    assert.equal((await request('/v1/sessions/' + 'A'.repeat(32))).status, 404);
    for (const body of [null, [], { plaintext: 'configuration' }, { id: 'chosen' }]) assert.equal((await request('/v1/sessions', 'POST', undefined, body)).status, 400);
    assert.equal((await request('/v1/sessions', 'POST', undefined, {}, { 'Content-Type': 'text/plain' })).status, 415);
    const item = await session();
    for (const body of [null, [], {}, { ...payload, key: 'secret' }, { ...payload, iv: 'invalid' }, { ...payload, ciphertext: null }, { ...payload, ciphertext: 'AB' }, { ...payload, ciphertext: payload.ciphertext + '=' }]) {
        assert.equal((await request('/v1/sessions/' + item.id, 'PUT', item.sendToken, body)).status, 400);
    }
    assert.equal((await request('/v1/sessions/' + item.id, 'POST', item.receiveToken, {})).status, 405);
    assert.equal((await (await request('/v1/sessions/' + item.id, 'GET', item.receiveToken)).json()).status, 'waiting');
});

test('ciphertext size includes the GCM tag and the raw request stream is bounded even without Content-Length', async () => {
    const largest = { ...payload, ciphertext: Buffer.alloc(MAX_PLAINTEXT_BYTES + 16).toString('base64url') };
    const item = await session();
    const path = '/v1/sessions/' + item.id;
    assert.equal((await request(path, 'PUT', item.sendToken, { ...largest, ciphertext: Buffer.alloc(MAX_PLAINTEXT_BYTES + 17).toString('base64url') })).status, 413);
    assert.equal((await request(path, 'PUT', item.sendToken, largest)).status, 200);
    assert.equal(JSON.stringify(largest).length < MAX_BODY_BYTES, true);
    let cancelled = false;
    const huge = new Request('https://example.test', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, duplex: 'half',
        body: new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(MAX_BODY_BYTES + 1)); }, cancel() { cancelled = true; } })
    });
    await assert.rejects(() => readJSON(huge), error => error.status === 413);
    assert.equal(cancelled, true);
    assert.throws(() => validatePayload({ ...payload, ciphertext: Buffer.alloc(15).toString('base64url') }), error => error.status === 400);
});

function memoryContext() {
    const values = new Map();
    let queue = Promise.resolve();
    const storage = {
        values, alarm: null,
        async get(key) { return structuredClone(values.get(key)); },
        async put(key, value) { values.set(key, structuredClone(value)); },
        async delete(key) { return values.delete(key); },
        async deleteAll() { values.clear(); storage.alarm = null; },
        async setAlarm(value) { storage.alarm = value; },
        async transaction(callback) { const promise = queue.then(() => callback(storage)); queue = promise.catch(() => {}); return promise; }
    };
    return { storage, blockConcurrencyWhile: callback => callback() };
}

test('only token hashes are stored; expiry is enforced before the alarm, and alarm cleanup is idempotent', async () => {
    const ctx = memoryContext();
    const object = new PairingSession(ctx);
    const created = await (await object.fetch(new Request('https://internal/initialize', { method: 'POST' }))).json();
    const stored = JSON.stringify(ctx.storage.values.get('session'));
    assert.equal(stored.includes(created.sendToken), false);
    assert.equal(stored.includes(created.receiveToken), false);
    assert.equal(ctx.storage.alarm, created.expiresAt);
    await object.alarm();
    assert.equal(ctx.storage.alarm, created.expiresAt);
    assert.equal(ctx.storage.values.size, 1);
    const value = ctx.storage.values.get('session');
    value.expiresAt = Date.now() - 1;
    const response = await object.fetch(new Request('https://internal/session', { headers: { Authorization: 'Bearer ' + created.receiveToken } }));
    assert.equal(response.status, 410);
    assert.equal(ctx.storage.values.size, 0);
    await object.alarm();
    await object.alarm();
    assert.equal(ctx.storage.alarm, null);
    assert.equal(ctx.storage.values.size, 0);
});

test('rate limits stop requests before touching Durable Objects and missing bindings fail closed', async () => {
    let touched = false;
    const env = {
        CREATE_LIMITER: { limit: async () => ({ success: false }) },
        REQUEST_LIMITER: { limit: async () => ({ success: false }) },
        PAIRING_SESSIONS: { idFromName() { touched = true; throw new Error('Should not reach storage'); } }
    };
    const createRequest = () => new Request('https://relay.test/v1/sessions', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: '{}' });
    const denied = await worker.fetch(createRequest(), env);
    assert.equal(denied.status, 429);
    assert.equal(denied.headers.get('Retry-After'), '60');
    assert.equal(denied.headers.get('Access-Control-Allow-Origin'), ORIGIN);
    const get = new Request('https://relay.test/v1/sessions/' + 'a'.repeat(32), { headers: { Origin: ORIGIN, Authorization: 'Bearer ' + 'b'.repeat(64) } });
    assert.equal((await worker.fetch(get, env)).status, 429);
    assert.equal(touched, false);
    assert.equal((await worker.fetch(createRequest(), {})).status, 503);
});
