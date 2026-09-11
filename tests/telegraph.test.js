'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../js/state.js');
const Telegraph = require('../js/telegraph.js');
const TOKEN = 'a'.repeat(60);
const OTHER_TOKEN = 'b'.repeat(60);
const REMOVED_CONTENT = [{ tag: 'p', children: ['EvPortal backup removed.'] }];

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

function success(call) {
    if (call.method === 'createAccount') return reply({ access_token: TOKEN });
    if (call.method === 'createPage') return reply({ path: call.parameters.title + '-09-10' });
    return reply({ path: call.parameters.path });
}

function fakeAPI(handler) {
    const calls = [];
    return { calls, fetch: async (url, options) => {
        const call = { url, method: url.split('/').pop(), options, parameters: Object.fromEntries(options.body.entries()) };
        calls.push(call);
        return handler ? handler(call) : success(call);
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
    assert.deepEqual(api.calls.map(call => call.method), ['createPage', 'editPage']);
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
    assert.deepEqual(api.calls.map(call => call.method), ['createPage', 'editPage']);
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
    assert.deepEqual(api.calls.map(call => call.method), ['createAccount', 'createPage', 'editPage']);
    assert.equal(JSON.parse(saved.getItem(Telegraph.STORAGE_KEY)).accessToken, TOKEN);
    assert.equal(saved.getItem('config'), null);
    assert.equal(result.shareURL, 'https://portal.example/app/?code=' + api.calls[1].parameters.title + '-09-10');
    assert.equal(result.telegraphURL, 'https://telegra.ph/' + api.calls[1].parameters.title + '-09-10');
    assert.equal(api.calls[1].parameters.content.includes(TOKEN), false);
    for (const call of api.calls) {
        assert.equal(call.url.includes(TOKEN), false);
        assert.equal(call.options.method, 'POST');
        assert.equal(call.options.credentials, 'omit');
        assert.equal(call.options.referrerPolicy, 'no-referrer');
    }
    await client.publish(state(), Telegraph.PUBLIC_URL);
    assert.deepEqual(api.calls.map(call => call.method), ['createAccount', 'createPage', 'editPage', 'createPage', 'editPage']);
});

test('simultaneous publication clicks share one in-flight account and page request', async () => {
    let release;
    const waiting = new Promise(resolve => { release = resolve; });
    const api = fakeAPI(async call => { await waiting; return success(call); });
    const client = Telegraph.createClient({ storage: storage(), fetch: api.fetch });
    const first = client.publish(state(), Telegraph.PUBLIC_URL);
    const second = client.publish(state(), Telegraph.PUBLIC_URL);
    assert.equal(first, second);
    release();
    assert.deepEqual(await first, await second);
    assert.deepEqual(api.calls.map(call => call.method), ['createAccount', 'createPage', 'editPage']);
});

test('unavailable storage keeps a session account and warns without losing the published link', async () => {
    const unavailable = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
    for (const saved of [null, unavailable, { getItem() { return null; }, setItem() { throw new Error('quota'); } }]) {
        const api = fakeAPI();
        const client = Telegraph.createClient({ storage: saved, fetch: api.fetch });
        const result = await client.publish(state(), Telegraph.PUBLIC_URL);
        assert.match(result.warning, /session/);
        assert.match(result.shareURL, /code=EVP-[a-f0-9]{32}/);
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

test('reopening the library requests its first page while another page is pending', async () => {
    const resolvers = new Map();
    const api = fakeAPI(call => new Promise(resolve => { resolvers.set(call.parameters.offset, resolve); }));
    const client = Telegraph.createClient({ storage: storage({ config: JSON.stringify({ accesstoken: TOKEN }) }), fetch: api.fetch });
    const olderPage = client.listPages(200);
    assert.equal(client.listPages(200), olderPage, 'Repeated requests for the same offset share their response');
    const firstPage = client.listPages(0);
    assert.notEqual(firstPage, olderPage, 'Different offsets must never share a pending response');
    assert.deepEqual(api.calls.map(call => call.parameters.offset), ['200', '0']);
    resolvers.get('0')(reply({ total_count: 201, pages: [{ path: 'Latest-09-10', title: 'Latest' }] }));
    assert.deepEqual(await firstPage, { total: 201, nextOffset: 1, pages: [{ path: 'Latest-09-10', title: 'Latest' }] });
    resolvers.get('200')(reply({ total_count: 201, pages: [{ path: 'Older-09-10', title: 'Older' }] }));
    assert.deepEqual(await olderPage, { total: 201, nextOffset: 201, pages: [{ path: 'Older-09-10', title: 'Older' }] });
    const refreshed = client.listPages(0);
    assert.equal(api.calls.length, 3, 'A completed page is refreshed on the next library opening');
    resolvers.get('0')(reply({ total_count: 0, pages: [] }));
    assert.deepEqual(await refreshed, { total: 0, nextOffset: 0, pages: [] });
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
    await assert.rejects(client.publish(state(), Telegraph.PUBLIC_URL), /Mes sauvegardes/);
    assert.equal(signal.aborted, true);
});

test('a fresh 128-bit cryptographic path is reserved without user content before publishing the readable title', async () => {
    const api = fakeAPI();
    let draws = 0;
    const crypto = { getRandomValues(bytes) {
        assert.equal(bytes.length, 16);
        assert.equal(bytes instanceof Uint8Array, true);
        bytes.set(Array.from({ length: 16 }, (_, index) => index + draws));
        draws += 1;
        return bytes;
    } };
    const client = Telegraph.createClient({ storage: storage({ config: JSON.stringify({ accesstoken: TOKEN }) }), fetch: api.fetch, crypto });
    const initial = state();
    const first = await client.publish(initial, Telegraph.PUBLIC_URL, 'Ma Tesla');
    const second = await client.publish(initial, Telegraph.PUBLIC_URL, 'Ma Tesla');
    assert.equal(draws, 2);
    assert.notEqual(first.path, second.path);
    assert.match(first.path, /^EVP-000102030405060708090a0b0c0d0e0f-09-10$/);
    for (let index = 0; index < api.calls.length; index += 2) {
        const reservation = api.calls[index], publication = api.calls[index + 1];
        assert.equal(reservation.method, 'createPage');
        assert.match(reservation.parameters.title, /^EVP-[a-f0-9]{32}$/);
        assert.equal(reservation.parameters.title.includes('Ma Tesla'), false);
        assert.deepEqual(JSON.parse(reservation.parameters.content), [{ tag: 'p', children: ['EvPortal'] }]);
        assert.equal(reservation.parameters.content.includes('example.org'), false);
        assert.equal(publication.method, 'editPage');
        assert.equal(publication.parameters.path, reservation.parameters.title + '-09-10');
        assert.equal(publication.parameters.title, 'Ma Tesla');
        assert.deepEqual(Core.parseImport(JSON.parse(publication.parameters.content)[0].children[0]), initial);
    }
});

test('unavailable or failing secure randomness stops before creating an account or publishing anything', async () => {
    for (const crypto of [null, {}, { getRandomValues() { throw new Error('unavailable'); } }]) {
        const api = fakeAPI();
        const client = Telegraph.createClient({ storage: storage(), fetch: api.fetch, crypto });
        await assert.rejects(client.publish(state(), Telegraph.PUBLIC_URL), /aléatoire/);
        assert.equal(api.calls.length, 0);
    }
});

test('a server path missing any part of the random identifier never receives the user configuration', async () => {
    for (const makePath of [() => 'My-EvPortal-shortcuts-09-11', call => call.parameters.title.slice(0, -1) + '-09-11', () => 'https://example.org/page']) {
        const api = fakeAPI(call => reply({ path: makePath(call) }));
        const client = Telegraph.createClient({ storage: storage({ config: JSON.stringify({ accesstoken: TOKEN }) }), fetch: api.fetch });
        await assert.rejects(client.publish(state(), Telegraph.PUBLIC_URL), /Aucune configuration/);
        assert.deepEqual(api.calls.map(call => call.method), ['createPage']);
        assert.deepEqual(JSON.parse(api.calls[0].parameters.content), [{ tag: 'p', children: ['EvPortal'] }]);
    }
});

test('failed or inconsistent final publication is not returned as a working backup and retries get a fresh random path', async () => {
    for (const badResult of [() => ({ ok: false }), () => reply({ path: 'different-09-10' })]) {
        let fail = true;
        const api = fakeAPI(call => call.method === 'editPage' && fail ? badResult() : success(call));
        const client = Telegraph.createClient({ storage: storage({ config: JSON.stringify({ accesstoken: TOKEN }) }), fetch: api.fetch });
        await assert.rejects(client.publish(state(), Telegraph.PUBLIC_URL));
        fail = false;
        const published = await client.publish(state(), Telegraph.PUBLIC_URL);
        assert.notEqual(api.calls[0].parameters.title, api.calls[2].parameters.title);
        assert.equal(published.path, api.calls[3].parameters.path);
    }
});

test('history hides only unfinished reservations, while preserving both old links and user-chosen names', async () => {
    const title = 'EVP-' + 'a'.repeat(32);
    const api = fakeAPI(() => reply({ total_count: 3, pages: [
        { path: title + '-09-10', title, author_name: 'EvPortal (pending)' },
        { path: title + '-09-10-2', title, author_name: 'EvPortal' },
        { path: 'My-EvPortal-shortcuts-09-11-2', title: 'My EvPortal shortcuts' }
    ] }));
    const client = Telegraph.createClient({ storage: storage({ config: JSON.stringify({ accesstoken: TOKEN }) }), fetch: api.fetch });
    const history = await client.listPages();
    assert.equal(history.pages.length, 2);
    assert.equal(history.pages[0].title, title);
    assert.equal(history.pages[1].path, 'My-EvPortal-shortcuts-09-11-2');
    assert.equal(history.nextOffset, 3);
});

test('a final-write timeout preserves the account and recommends checking history rather than claiming success', async () => {
    let signal;
    const saved = storage({ config: JSON.stringify({ accesstoken: TOKEN }) });
    const api = fakeAPI(call => {
        if (call.method !== 'editPage') return success(call);
        signal = call.options.signal;
        return new Promise(() => {});
    });
    const client = Telegraph.createClient({ storage: saved, fetch: api.fetch, timeoutMs: 5 });
    await assert.rejects(client.publish(state(), Telegraph.PUBLIC_URL), /Mes sauvegardes/);
    assert.equal(signal.aborted, true);
    assert.equal(JSON.parse(saved.getItem('config')).accesstoken, TOKEN);
});

test('deleting a backup replaces its content and clears its author with the existing account and hides stale history', async () => {
    const saved = storage({ config: JSON.stringify({ accesstoken: TOKEN }) });
    const api = fakeAPI(call => call.method === 'getPageList'
        ? reply({ total_count: 1, pages: [{ path: 'Old-09-09', title: 'My backup' }] })
        : reply({ path: call.parameters.path, title: 'Deleted Page', content: [{ children: ['EvPortal backup removed.'], attrs: {}, tag: 'p' }], author_name: '', author_url: '' }));
    const client = Telegraph.createClient({ storage: saved, fetch: api.fetch });
    assert.deepEqual(await client.removePage('Old-09-09'), { path: 'Old-09-09' });
    assert.equal(api.calls[0].method, 'editPage');
    assert.deepEqual(api.calls[0].parameters, { access_token: TOKEN, path: 'Old-09-09', title: 'Deleted Page', author_name: '', author_url: '', content: JSON.stringify(REMOVED_CONTENT), return_content: 'true' });
    assert.equal((await client.listPages()).pages.length, 0);
    assert.equal(JSON.parse(saved.getItem('config')).accesstoken, TOKEN);
    assert.equal(api.calls.some(call => call.method === 'createAccount'), false);
});

test('deletion validates the path and never creates an account', async () => {
    const api = fakeAPI();
    const anonymous = Telegraph.createClient({ storage: storage(), fetch: api.fetch });
    await assert.rejects(anonymous.removePage('Old-09-09'), /compte/);
    const client = Telegraph.createClient({ storage: storage({ config: JSON.stringify({ accesstoken: TOKEN }) }), fetch: api.fetch });
    await assert.rejects(client.removePage('https://evil.example/page'));
    await assert.rejects(client.removePage('../other'));
    assert.equal(api.calls.length, 0);
});

test('concurrent deletion requests share one request and failed deletion remains available to retry', async () => {
    let release;
    let fail = true;
    const gate = new Promise(resolve => { release = resolve; });
    const api = fakeAPI(async call => {
        if (call.method === 'getPageList') return reply({ total_count: 1, pages: [{ path: 'Old-09-09', title: 'My backup' }] });
        await gate;
        return fail ? { ok: false } : reply({ path: call.parameters.path, title: 'Deleted Page', content: REMOVED_CONTENT });
    });
    const client = Telegraph.createClient({ storage: storage({ config: JSON.stringify({ accesstoken: TOKEN }) }), fetch: api.fetch });
    const first = client.removePage('Old-09-09');
    const second = client.removePage('Old-09-09');
    assert.equal(first, second);
    assert.equal(api.calls.length, 1);
    release();
    await assert.rejects(first);
    assert.equal((await client.listPages()).pages.length, 1, 'A failure must not hide the backup');
    fail = false;
    await client.removePage('Old-09-09');
    assert.equal((await client.listPages()).pages.length, 0);
});

test('deletion requires a response confirming only the replacement message, erased author and the matching page', async () => {
    for (const result of [
        { path: 'Old-09-09', title: 'Deleted Page', content: [] },
        { path: 'Old-09-09', title: 'Deleted Page', content: [...REMOVED_CONTENT, 'private content'] },
        { path: 'Old-09-09', title: 'Deleted Page', content: [{ ...REMOVED_CONTENT[0], attrs: { href: 'https://example.org/private' } }] },
        { path: 'Other-09-09', title: 'Deleted Page', content: REMOVED_CONTENT },
        { path: 'Old-09-09', title: 'My backup', content: REMOVED_CONTENT },
        { path: 'Old-09-09', title: 'Deleted Page', content: ['private content'] },
        { path: 'Old-09-09', title: 'Deleted Page', content: REMOVED_CONTENT, author_name: 'old author' },
        { path: 'Old-09-09', title: 'Deleted Page', content: REMOVED_CONTENT, author_url: 'https://example.org/private' }
    ]) {
        const api = fakeAPI(() => reply(result));
        const client = Telegraph.createClient({ storage: storage({ config: JSON.stringify({ accesstoken: TOKEN }) }), fetch: api.fetch });
        await assert.rejects(client.removePage('Old-09-09'), /illisible/);
    }
});
