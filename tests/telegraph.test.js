'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../js/state.js');
const Telegraph = require('../js/telegraph.js');
const TOKEN = 'a'.repeat(60);
const OTHER_TOKEN = 'b'.repeat(60);

function state() {
    return Core.normalizeState({ version: 2, theme: 'dark', activeCategory: 'cinema', categories: [
        { id: 'cinema', label: 'Cinéma', shortcuts: [
            { id: 'one', name: 'Été', url: 'https://example.org/été', favorite: true },
            { id: 'two', name: '<img src=x onerror=alert(1)>', url: 'https://example.org/other' }
        ] }
    ] });
}

function storage(initial) {
    const values = new Map(Object.entries(initial || {}));
    return { getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)), values };
}

function reply(result) { return { ok: true, json: async () => ({ ok: true, result }) }; }

function fakeAPI(handler) {
    const calls = [];
    return { calls, fetch: async (url, options) => {
        const call = { url, method: url.split('/').pop(), options, parameters: Object.fromEntries(options.body.entries()) };
        calls.push(call);
        return handler ? handler(call) : reply(call.method === 'createAccount' ? { access_token: TOKEN } : { path: 'EvPortal-09-10' });
    } };
}

test('Telegraph content round-trips Unicode, settings and tile order without account data', () => {
    const input = state();
    input.access_token = TOKEN;
    input.config = { accesstoken: TOKEN };
    input.categories[0].shortcuts[0].secret = TOKEN;
    input.categories[0].shortcuts.reverse();
    const content = Telegraph.contentForState(input);
    assert.equal(content.includes(TOKEN), false);
    const nodes = JSON.parse(content);
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].tag, 'pre');
    assert.deepEqual(Core.parseImport(nodes[0].children[0]), Core.normalizeState(input));
    assert.equal(content.includes('\n'), false);
});

test('the full default catalogue fits the documented 64 KB Telegra.ph content limit', () => {
    const context = { window: {} };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(require.resolve('../js/catalog.js'), 'utf8'), context);
    const encoded = Telegraph.contentForState(Core.fromCatalog(context.window.EV_CATALOG));
    assert.ok(Buffer.byteLength(encoded) <= Telegraph.MAX_CONTENT_BYTES);
});

test('the byte limit includes the node wrapper and UTF-8, and fails before creating an account', async () => {
    const input = state();
    input.categories[0].shortcuts = Array.from({ length: 100 }, (_, index) => ({
        id: 'item-' + index, name: 'Écran', url: 'https://example.org/' + index, description: 'é'.repeat(300)
    }));
    const serialized = JSON.stringify([{ tag: 'pre', children: [JSON.stringify(Core.normalizeState(input))] }]);
    assert.ok(serialized.length < Telegraph.MAX_CONTENT_BYTES);
    assert.ok(Buffer.byteLength(serialized) > Telegraph.MAX_CONTENT_BYTES);
    const api = fakeAPI();
    const client = Telegraph.createClient({ storage: storage(), fetch: api.fetch });
    await assert.rejects(client.publish(input, Telegraph.PUBLIC_URL), /64 Ko/);
    assert.equal(api.calls.length, 0);
});

test('share links retain the portal deployment path and contain only the public code', () => {
    assert.equal(Telegraph.shareURL('https://portal.example/car/?token=secret#music', 'EvPortal-09-10'), 'https://portal.example/car/?code=EvPortal-09-10');
    assert.equal(Telegraph.shareURL('http://192.168.1.20:4188/?code=old', 'New-09-10'), 'http://192.168.1.20:4188/?code=New-09-10');
    assert.equal(Telegraph.defaultBaseURL('http://localhost:4188/?code=test'), Telegraph.PUBLIC_URL);
    assert.equal(Telegraph.defaultBaseURL('http://127.0.0.1:4188/'), Telegraph.PUBLIC_URL);
    assert.equal(Telegraph.defaultBaseURL('http://[::1]:4188/'), Telegraph.PUBLIC_URL);
    assert.equal(Telegraph.defaultBaseURL('https://preview.example/EvPortal/?code=test#cinema'), 'https://preview.example/EvPortal/');
    for (const base of ['javascript:alert(1)', 'https://name:password@portal.example/', '//portal.example/']) assert.throws(() => Telegraph.shareURL(base, 'EvPortal-09-10'));
    for (const path of ['../other', 'EvPortal?access_token=secret', 'https://evil.example/path']) assert.throws(() => Telegraph.shareURL(Telegraph.PUBLIC_URL, path));
});

test('legacy account migration preserves every old and unrelated key and reuses its account', async () => {
    const original = { config: JSON.stringify({ accesstoken: TOKEN, randomID: '123456789' }), pages: '["cinema"]', other: 'untouched' };
    const saved = storage(original);
    const api = fakeAPI();
    const client = Telegraph.createClient({ storage: saved, fetch: api.fetch });
    assert.equal(api.calls.length, 0);
    assert.equal(JSON.parse(saved.getItem(Telegraph.STORAGE_KEY)).accessToken, TOKEN);
    for (const [key, value] of Object.entries(original)) assert.equal(saved.getItem(key), value);
    const result = await client.publish(state(), Telegraph.PUBLIC_URL, 'Ma Tesla');
    assert.deepEqual(api.calls.map(call => call.method), ['createPage']);
    assert.equal(api.calls[0].parameters.access_token, TOKEN);
    assert.equal(result.warning, '');
    assert.equal(JSON.stringify(result).includes(TOKEN), false);
});

test('an existing v1 account takes precedence without altering the old account', async () => {
    const legacy = JSON.stringify({ accesstoken: TOKEN });
    const saved = storage({ config: legacy, [Telegraph.STORAGE_KEY]: JSON.stringify({ version: 1, accessToken: OTHER_TOKEN }) });
    const api = fakeAPI();
    await Telegraph.createClient({ storage: saved, fetch: api.fetch }).publish(state(), Telegraph.PUBLIC_URL);
    assert.equal(api.calls[0].parameters.access_token, OTHER_TOKEN);
    assert.equal(saved.getItem('config'), legacy);
});

test('a corrupt new account entry is kept intact while a usable legacy account remains accessible', async () => {
    const saved = storage({ [Telegraph.STORAGE_KEY]: '{broken', config: JSON.stringify({ accesstoken: TOKEN }) });
    const api = fakeAPI();
    await Telegraph.createClient({ storage: saved, fetch: api.fetch }).publish(state(), Telegraph.PUBLIC_URL);
    assert.equal(saved.getItem(Telegraph.STORAGE_KEY), '{broken');
    assert.deepEqual(api.calls.map(call => call.method), ['createPage']);
    assert.equal(api.calls[0].parameters.access_token, TOKEN);
});

test('a new account is created only on publication, persisted separately, then reused', async () => {
    const saved = storage();
    const api = fakeAPI();
    const client = Telegraph.createClient({ storage: saved, fetch: api.fetch });
    assert.equal(api.calls.length, 0);
    assert.deepEqual(await client.listPages(), { pages: [], total: 0, nextOffset: 0 });
    assert.equal(api.calls.length, 0);
    const result = await client.publish(state(), 'https://portal.example/app/', 'Mon portail');
    assert.deepEqual(api.calls.map(call => call.method), ['createAccount', 'createPage']);
    assert.equal(JSON.parse(saved.getItem(Telegraph.STORAGE_KEY)).accessToken, TOKEN);
    assert.equal(saved.getItem('config'), null);
    assert.equal(result.shareURL, 'https://portal.example/app/?code=EvPortal-09-10');
    assert.equal(result.telegraphURL, 'https://telegra.ph/EvPortal-09-10');
    assert.equal(api.calls[1].parameters.content.includes(TOKEN), false);
    for (const call of api.calls) {
        assert.equal(call.url.includes(TOKEN), false);
        assert.equal(call.options.method, 'POST');
        assert.equal(call.options.credentials, 'omit');
        assert.equal(call.options.referrerPolicy, 'no-referrer');
    }
    await client.publish(state(), Telegraph.PUBLIC_URL);
    assert.deepEqual(api.calls.map(call => call.method), ['createAccount', 'createPage', 'createPage']);
});

test('simultaneous publication clicks share one in-flight account and page request', async () => {
    let release;
    const waiting = new Promise(resolve => { release = resolve; });
    const api = fakeAPI(async call => { await waiting; return reply(call.method === 'createAccount' ? { access_token: TOKEN } : { path: 'EvPortal-09-10' }); });
    const client = Telegraph.createClient({ storage: storage(), fetch: api.fetch });
    const first = client.publish(state(), Telegraph.PUBLIC_URL);
    const second = client.publish(state(), Telegraph.PUBLIC_URL);
    assert.equal(first, second);
    release();
    assert.deepEqual(await first, await second);
    assert.deepEqual(api.calls.map(call => call.method), ['createAccount', 'createPage']);
});

test('unavailable storage keeps a session account and warns without losing the published link', async () => {
    const unavailable = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
    for (const saved of [null, unavailable, { getItem() { return null; }, setItem() { throw new Error('quota'); } }]) {
        const api = fakeAPI();
        const client = Telegraph.createClient({ storage: saved, fetch: api.fetch });
        const result = await client.publish(state(), Telegraph.PUBLIC_URL);
        assert.match(result.warning, /session/);
        assert.match(result.shareURL, /code=EvPortal/);
        await client.publish(state(), Telegraph.PUBLIC_URL);
        assert.equal(api.calls.filter(call => call.method === 'createAccount').length, 1);
    }
});

test('validation of the destination and title happens before any network request', async () => {
    const api = fakeAPI();
    const client = Telegraph.createClient({ storage: storage(), fetch: api.fetch });
    await assert.rejects(client.publish(state(), 'javascript:alert(1)'), /HTTP|http/);
    await assert.rejects(client.publish(state(), Telegraph.PUBLIC_URL, 'x'.repeat(257)), /256/);
    await assert.rejects(client.publish({ version: 99 }, Telegraph.PUBLIC_URL));
    assert.equal(api.calls.length, 0);
});

test('history is requested explicitly, uses the old token, paginates and omits previously cleared pages', async () => {
    const api = fakeAPI(call => reply({ total_count: 205, pages: [{ path: 'Saved-09-10', title: '<img src=x>' }, { path: 'Deleted-09-10', title: 'Deleted Page' }] }));
    const client = Telegraph.createClient({ storage: storage({ config: JSON.stringify({ accesstoken: TOKEN }) }), fetch: api.fetch });
    assert.equal(api.calls.length, 0);
    const result = await client.listPages(200);
    assert.deepEqual(result, { pages: [{ path: 'Saved-09-10', title: '<img src=x>' }], total: 205, nextOffset: 202 });
    assert.deepEqual(api.calls.map(call => call.method), ['getPageList']);
    assert.equal(api.calls[0].parameters.access_token, TOKEN);
    assert.equal(api.calls[0].parameters.offset, '200');
    assert.equal(api.calls[0].parameters.limit, '200');
    await assert.rejects(client.listPages(-1), /Position/);
    assert.equal(api.calls.length, 1);
});

test('an expired account fails visibly and is neither replaced nor deleted', async () => {
    const saved = storage({ config: JSON.stringify({ accesstoken: TOKEN }) });
    const api = fakeAPI(() => ({ ok: true, json: async () => ({ ok: false, error: 'ACCESS_TOKEN_INVALID' }) }));
    const client = Telegraph.createClient({ storage: saved, fetch: api.fetch });
    await assert.rejects(client.publish(state(), Telegraph.PUBLIC_URL), /ancien compte reste conservé/);
    assert.deepEqual(api.calls.map(call => call.method), ['createPage']);
    assert.equal(JSON.parse(saved.getItem('config')).accesstoken, TOKEN);
    assert.equal(JSON.parse(saved.getItem(Telegraph.STORAGE_KEY)).accessToken, TOKEN);
});

test('network, HTTP, malformed responses and service errors do not disclose raw tokens', async () => {
    const replies = [
        () => { throw new Error('Network ' + TOKEN); },
        () => ({ ok: false }),
        () => ({ ok: true, json: async () => { throw new Error('Malformed ' + TOKEN); } }),
        () => ({ ok: true, json: async () => ({ ok: false, error: TOKEN }) }),
        () => reply({ path: 'https://evil.example/path' })
    ];
    for (const handler of replies) {
        const api = fakeAPI(handler);
        const client = Telegraph.createClient({ storage: storage({ config: JSON.stringify({ accesstoken: TOKEN }) }), fetch: api.fetch });
        await assert.rejects(client.publish(state(), Telegraph.PUBLIC_URL), error => !error.message.includes(TOKEN));
    }
});

test('a timed-out publication aborts and recommends checking history before creating duplicates', async () => {
    let signal;
    const client = Telegraph.createClient({ storage: storage({ config: JSON.stringify({ accesstoken: TOKEN }) }), timeoutMs: 5,
        fetch: async (_, options) => { signal = options.signal; return new Promise(() => {}); }
    });
    await assert.rejects(client.publish(state(), Telegraph.PUBLIC_URL), /Mes partages/);
    assert.equal(signal.aborted, true);
});
