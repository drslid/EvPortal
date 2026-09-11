import assert from 'node:assert/strict';

const base = process.env.RELAY_BASE_URL || 'http://127.0.0.1:8787';
const origin = process.env.PORTAL_ORIGIN || 'http://127.0.0.1:4187';
const send = (path, method = 'GET', token, body) => fetch(base + path, {
    method,
    headers: { Origin: origin, ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
});

assert.equal((await send('/health')).status, 200);
const created = await send('/v1/sessions', 'POST', undefined, {});
assert.equal(created.status, 201);
const session = await created.json();
const path = '/v1/sessions/' + session.id;
try {
    assert.equal((await (await send(path, 'GET', session.receiveToken)).json()).status, 'waiting');
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const additionalData = new TextEncoder().encode('evportal-pairing-v1:' + session.id);
    const plaintext = new TextEncoder().encode(JSON.stringify({ version: 2, categories: [], theme: 'dark', activeCategory: 'all' }));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData }, key, plaintext);
    const payload = { iv: Buffer.from(iv).toString('base64url'), ciphertext: Buffer.from(ciphertext).toString('base64url') };
    assert.equal((await send(path, 'PUT', session.sendToken, payload)).status, 200);
    assert.equal((await send(path, 'PUT', session.sendToken, payload)).status, 200);
    assert.equal((await send(path, 'GET', session.sendToken)).status, 401);
    const received = await (await send(path, 'GET', session.receiveToken)).json();
    assert.equal(received.status, 'ready');
    assert.equal(received.expiresAt, session.expiresAt);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(received.payload.iv, 'base64url'), additionalData }, key, Buffer.from(received.payload.ciphertext, 'base64url'));
    assert.deepEqual(new Uint8Array(decrypted), plaintext);
    assert.equal((await send(path, 'DELETE', session.receiveToken)).status, 204);
    assert.equal((await send(path, 'GET', session.receiveToken)).status, 410);
    console.log('Relay smoke passed: create, encrypt, send, retry, authorization, receive, decrypt, delete.');
} finally { await send(path, 'DELETE', session.receiveToken).catch(() => {}); }
