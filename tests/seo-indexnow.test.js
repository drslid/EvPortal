'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function fixture(t) {
    const api = await import('../scripts/notify-indexnow.mjs');
    const { releaseFingerprint } = await import('../scripts/seo-release.mjs');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evportal-indexnow-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const base = 'https://portal.example/project/';
    const key = '0123456789abcdef0123456789abcdef';
    const keyFile = 'indexnow-' + key + '.txt';
    const contents = new Map();
    function write(file, value) {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), value);
        contents.set(base + file.replace(/index\.html$/, ''), value);
    }
    write('seo.config.json', JSON.stringify({ baseURL: base, indexNow: { keyFile } }));
    write(keyFile, key + '\n');
    const urls = [];
    for (const language of ['', 'en', 'fr', 'es', 'de', 'it', 'ru', 'ar', 'pt']) for (const guide of [false, true]) {
        const prefix = language ? language + '/' : '';
        const file = prefix + (guide ? 'aide.html' : 'index.html');
        write(file, '<html lang="' + (language || 'fr') + '"><title>EvPortal</title><p>' + file + '</p></html>');
        urls.push(base + prefix + (guide ? 'aide.html' : ''));
    }
    write('sitemap.xml', '<urlset>' + urls.map(url => '<url><loc>' + url + '</loc></url>').join('') + '</urlset>');
    write('robots.txt', 'User-agent: *\nDisallow:\n');
    const pages = new Map([...contents].filter(([url]) => !url.endsWith('seo.config.json') && !url.endsWith(keyFile)).map(([url, content]) => {
        const name = url.slice(base.length);
        return [name.endsWith('/') || !name ? name + 'index.html' : name, content];
    }));
    write('seo-release.json', JSON.stringify({ version: 1, fingerprint: releaseFingerprint(root, pages) }));
    const requests = [];
    let status = 200;
    const fetcher = async (url, options = {}) => {
        requests.push({ url, options });
        assert.equal(options.redirect, 'error');
        if (options.method === 'POST') return new Response('', { status });
        return new Response(contents.has(url) ? contents.get(url) : '', { status: contents.has(url) ? 200 : 404 });
    };
    return { ...api, root, base, keyFile, contents, requests, fetcher, write, setStatus(value) { status = value; } };
}

test('IndexNow plans contain only the canonical public pages and a key scoped to the project directory', async t => {
    const f = await fixture(t), plan = f.notificationPlan(f.root);
    assert.equal(plan.payload.host, 'portal.example');
    assert.equal(plan.payload.keyLocation, f.base + f.keyFile);
    assert.equal(plan.payload.urlList.length, 18);
    assert.ok(plan.payload.urlList.every(value => value.startsWith(f.base) && !new URL(value).search && !new URL(value).hash));
    assert.equal(f.requests.length, 0, 'Preparing a plan never contacts a service');
});

test('private queries, fragments, other projects and duplicate sitemap entries are rejected before any request', async t => {
    for (const replacement of ['?code=PRIVATE', '#receive=PRIVATE', '../other/', 'https://other.example/']) {
        const f = await fixture(t);
        const source = fs.readFileSync(path.join(f.root, 'sitemap.xml'), 'utf8');
        f.write('sitemap.xml', source.replace('<loc>' + f.base + '</loc>', '<loc>' + new URL(replacement, f.base).href + '</loc>'));
        assert.throws(() => f.notificationPlan(f.root), /only the 18 public/);
        assert.equal(f.requests.length, 0);
    }
    const f = await fixture(t);
    const source = fs.readFileSync(path.join(f.root, 'sitemap.xml'), 'utf8');
    f.write('sitemap.xml', source.replace(f.base + 'en/', f.base + 'fr/'));
    assert.throws(() => f.notificationPlan(f.root), /only the 18 public/);
});

test('a stale release fingerprint prevents notification before checking individual pages', async t => {
    const f = await fixture(t), plan = f.notificationPlan(f.root);
    f.contents.set(plan.release.url, 'Old deployment');
    await assert.rejects(f.submitNotification(plan, f.fetcher), { code: 'NOT_DEPLOYED' });
    assert.equal(f.requests.length, 1);
    assert.ok(f.requests.every(request => request.options.method !== 'POST'));
});

test('locally changed runtime assets require regeneration before a notification can be prepared', async t => {
    const f = await fixture(t);
    f.write('js/config.js', 'window.example = true;');
    assert.throws(() => f.notificationPlan(f.root), /changed after generation/);
    assert.equal(f.requests.length, 0);
});

test('a wrong ownership file or outdated HTML prevents notification even when the fingerprint is current', async t => {
    for (const change of ['key', 'page']) {
        const f = await fixture(t), plan = f.notificationPlan(f.root);
        f.contents.set(change === 'key' ? plan.payload.keyLocation : plan.payload.urlList[5], 'Outdated content');
        await assert.rejects(f.submitNotification(plan, f.fetcher), { code: 'NOT_DEPLOYED' });
        assert.ok(f.requests.every(request => request.options.method !== 'POST'));
    }
});

test('a missing public file is treated as an incomplete deployment, not a successful submission', async t => {
    const f = await fixture(t), plan = f.notificationPlan(f.root);
    f.contents.delete(plan.files[0].url);
    await assert.rejects(f.submitNotification(plan, f.fetcher), { code: 'NOT_DEPLOYED' });
    assert.ok(f.requests.every(request => request.options.method !== 'POST'));
});

test('a fully matching release sends exactly one request and distinguishes received from ownership pending', async t => {
    for (const status of [200, 202]) {
        const f = await fixture(t), plan = f.notificationPlan(f.root);
        f.setStatus(status);
        assert.deepEqual(await f.submitNotification(plan, f.fetcher), { status, count: 18, ownershipPending: status === 202 });
        const posts = f.requests.filter(request => request.options.method === 'POST');
        assert.equal(posts.length, 1);
        assert.equal(posts[0].url, 'https://api.indexnow.org/indexnow');
        assert.deepEqual(JSON.parse(posts[0].options.body), plan.payload);
        assert.ok(f.requests.slice(0, -1).every(request => request.url.startsWith(f.base)), 'Preflight stays on the owned project');
    }
});

test('an interrupted public response can be retried without submitting an unchecked release', async t => {
    const f = await fixture(t), plan = f.notificationPlan(f.root);
    let interrupt = true;
    const fetcher = async (url, options) => {
        const response = await f.fetcher(url, options);
        if (url === plan.release.url && interrupt) {
            interrupt = false;
            return { status: 200, arrayBuffer: async () => { throw new Error('Connection interrupted'); } };
        }
        return response;
    };
    await assert.rejects(f.submitNotification(plan, fetcher), { code: 'NOT_DEPLOYED' });
    assert.ok(f.requests.every(request => request.options.method !== 'POST'));
    assert.equal((await f.submitNotification(plan, fetcher)).status, 200);
    assert.equal(f.requests.filter(request => request.options.method === 'POST').length, 1);
});

test('IndexNow rejection is reported without an automatic second submission', async t => {
    const f = await fixture(t), plan = f.notificationPlan(f.root);
    f.setStatus(429);
    await assert.rejects(f.submitNotification(plan, f.fetcher), /HTTP 429/);
    assert.equal(f.requests.filter(request => request.options.method === 'POST').length, 1);
});
