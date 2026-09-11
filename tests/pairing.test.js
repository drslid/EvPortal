'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const Pair = require('../js/pairing.js');
const Core = require('../js/state.js');
const id = 'a'.repeat(32);
const receiveToken = 'b'.repeat(64);
const sendToken = 'c'.repeat(64);
const fixture = () => ({ version: 2, theme: 'dark', activeCategory: 'personal', categories: [{ id: 'personal', label: 'Mes pauses', icon: 'charging', shortcuts: [{ id: 'link-a', name: 'Été', url: 'https://example.org/', favorite: true, clickCount: 7 }] }], account: { accessToken: 'never-transfer-this-secret' } });
const session = () => ({ id, receiveToken, sendToken, expiresAt: Date.now() + Pair.TTL_MS });
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

test('pairing encrypts portable settings only and round-trips Unicode, icon and usage', async () => {
    const key = Pair.createKey(webcrypto);
    const payload = await Pair.encryptState(fixture(), key, id, webcrypto);
    assert.deepEqual(Object.keys(payload).sort(), ['ciphertext', 'iv']);
    assert.equal(Pair.decode(payload.iv, 12).length, 12);
    assert.ok(!JSON.stringify(payload).includes('never-transfer'));
    const decoded = await Pair.decryptState(payload, key, id, webcrypto);
    assert.deepEqual(decoded, Core.normalizeState(fixture()));
    assert.equal(decoded.account, undefined);
    const second = await Pair.encryptState(fixture(), key, id, webcrypto);
    assert.notEqual(second.iv, payload.iv);
    assert.notEqual(second.ciphertext, payload.ciphertext);
});

test('wrong keys, session substitution and modified ciphertext fail authentication', async () => {
    const key = Pair.createKey(webcrypto);
    const payload = await Pair.encryptState(fixture(), key, id, webcrypto);
    await assert.rejects(Pair.decryptState(payload, Pair.createKey(webcrypto), id, webcrypto), error => error.i18nKey === 'pair.decryptFailed');
    await assert.rejects(Pair.decryptState(payload, key, 'd'.repeat(32), webcrypto), error => error.i18nKey === 'pair.decryptFailed');
    const tampered = Pair.decode(payload.ciphertext, Pair.MAX_BYTES + 16);
    tampered[0] ^= 1;
    await assert.rejects(Pair.decryptState({ iv: payload.iv, ciphertext: Pair.encode(tampered) }, key, id, webcrypto), error => error.i18nKey === 'pair.decryptFailed');
});

test('QR contains only the sender credentials and key in the fragment of the fixed public URL', () => {
    const created = session();
    const key = Pair.createKey(webcrypto);
    const url = new URL(Pair.pairingURL(created, key));
    assert.equal(url.origin + url.pathname, Pair.PUBLIC_URL);
    assert.equal(url.search, '');
    const parsed = Pair.parseFragment(url.hash);
    assert.deepEqual(parsed, { v: 1, id, token: sendToken, key, expiresAt: created.expiresAt });
    assert.ok(!JSON.stringify(parsed).includes(receiveToken));
    assert.throws(() => Pair.parseFragment(url.hash, created.expiresAt), error => error.i18nKey === 'pair.expired');
    const hostile = '#receive=' + Pair.encode(new TextEncoder().encode(JSON.stringify({ ...parsed, relayURL: 'https://attacker.example/' })));
    assert.throws(() => Pair.parseFragment(hostile), error => error.i18nKey === 'pair.invalidLink');
    const mistyped = '#receive=' + Pair.encode(new TextEncoder().encode(JSON.stringify({ ...parsed, id: [parsed.id] })));
    assert.throws(() => Pair.parseFragment(mistyped), error => error.i18nKey === 'pair.invalidLink');
    assert.throws(() => Pair.parseFragment(url.hash + '='), error => error.i18nKey === 'pair.invalidLink');
});

test('payload bounds and canonical base64url are enforced before decryption', async () => {
    assert.throws(() => Pair.decode('AB', 1));
    assert.throws(() => Pair.validatePayload({ iv: 'a'.repeat(16), ciphertext: 'a'.repeat(100000) }));
    assert.throws(() => Pair.validatePayload({ iv: 'a'.repeat(15), ciphertext: 'a'.repeat(22) }));
    assert.throws(() => Pair.validatePayload({ iv: 'a'.repeat(16), ciphertext: 'a'.repeat(22), token: sendToken }));
    const large = fixture();
    large.categories[0].shortcuts = Array.from({ length: 300 }, (_, index) => ({ id: 'link-' + index, name: 'Long shortcut', description: 'a'.repeat(300), url: 'https://example.org/' + index }));
    await assert.rejects(Pair.encryptState(large, Pair.createKey(webcrypto), id, webcrypto), error => error.i18nKey === 'pair.tooLarge');
});

test('authenticated payloads still pass normal state validation', async () => {
    const key = Pair.createKey(webcrypto);
    const rawKey = await webcrypto.subtle.importKey('raw', Pair.decode(key, 32), 'AES-GCM', false, ['encrypt']);
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const bad = fixture();
    bad.categories[0].shortcuts[0].url = 'javascript:alert(1)';
    const ciphertext = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('evportal-pairing-v1:' + id) }, rawKey, new TextEncoder().encode(JSON.stringify(bad)));
    await assert.rejects(Pair.decryptState({ iv: Pair.encode(iv), ciphertext: Pair.encode(new Uint8Array(ciphertext)) }, key, id, webcrypto), error => error.i18nKey === 'pair.invalidConfig');
});

test('relay client uses fixed endpoints, separate Bearer tokens and ciphertext-only writes', async () => {
    const created = session();
    const calls = [];
    const payload = await Pair.encryptState(fixture(), Pair.createKey(webcrypto), id, webcrypto);
    const responses = [json(created), json({ status: 'waiting', expiresAt: created.expiresAt }), json({ status: 'sent' }), json({ status: 'ready', expiresAt: created.expiresAt, payload }), new Response(null, { status: 204 })];
    const client = Pair.createClient({ relayURL: 'https://relay.example/', fetch: async (url, options) => { calls.push({ url, options }); return responses.shift(); } });
    assert.deepEqual(await client.create(), created);
    assert.equal((await client.read(created)).status, 'waiting');
    await client.send({ id, token: sendToken }, payload);
    assert.deepEqual((await client.read(created)).payload, payload);
    await client.remove(created);
    assert.deepEqual(calls.map(call => call.options.method), ['POST', 'GET', 'PUT', 'GET', 'DELETE']);
    assert.equal(calls[1].options.headers.Authorization, 'Bearer ' + receiveToken);
    assert.equal(calls[2].options.headers.Authorization, 'Bearer ' + sendToken);
    assert.deepEqual(JSON.parse(calls[2].options.body), payload);
    for (const call of calls) {
        assert.ok(call.url.startsWith('https://relay.example/v1/sessions'));
        assert.equal(call.options.credentials, 'omit');
        assert.equal(call.options.referrerPolicy, 'no-referrer');
        assert.equal(call.options.redirect, 'error');
        assert.equal(call.options.cache, 'no-store');
    }
});

test('relay URL and protocol validation reject unsafe endpoints and credentials', async () => {
    for (const value of ['', 'http://relay.example/', 'https://user:pass@relay.example/', 'https://relay.example/?host=other', 'https://relay.example/#secret']) assert.throws(() => Pair.relayURL(value));
    assert.equal(Pair.relayURL('http://127.0.0.1:8787/'), 'http://127.0.0.1:8787');
    const client = Pair.createClient({ relayURL: 'https://relay.example', fetch: async () => json({ ...session(), sendToken: receiveToken }) });
    await assert.rejects(client.create(), error => error.i18nKey === 'pair.invalidResponse');
    const expired = Pair.createClient({ relayURL: 'https://relay.example', fetch: async () => json({ error: 'expired' }, 410) });
    await assert.rejects(expired.read(session()), error => error.i18nKey === 'pair.expired');
});

test('request cancellation aborts in-flight polling without a user-facing network error', async () => {
    const caller = new AbortController();
    let outgoing;
    const client = Pair.createClient({ relayURL: 'https://relay.example', fetch: async (_, options) => new Promise((resolve, reject) => {
        outgoing = options.signal;
        options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }) });
    const waiting = client.read(session(), caller.signal);
    caller.abort();
    await assert.rejects(waiting, error => error.name === 'AbortError');
    assert.equal(outgoing.aborted, true);
});
