/* Isolated browser security checks. Synthetic profiles only; no private codes are logged or saved. */
'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const Sync = require('../js/sync.js');
const { fileRepository } = require('../sync/dev.cjs');
const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const fixture = {
    version: 2, activeCategory: 'all', categories: [{ id: 'personal', label: '<img src=x onerror=window.auditXSS=true>', shortcuts: [
        { id: 'custom-audit', name: '<svg/onload=window.auditXSS=true>', url: 'https://example.org/synthetic', favorite: true }
    ] }]
};
const probe = `window.auditCSP={inlineRan:false,evalRan:false,evalBlocked:false,fetchFinished:false,violations:[]};
document.addEventListener('securitypolicyviolation',event=>auditCSP.violations.push(event.effectiveDirective));
const inline=document.createElement('script');inline.textContent='window.auditCSP.inlineRan=true';document.head.append(inline);
try{eval('window.auditCSP.evalRan=true')}catch(_){auditCSP.evalBlocked=true}
const external=document.createElement('script');external.src='https://blocked.example/audit-script.js';document.head.append(external);
fetch('https://blocked.example/audit-connect').catch(()=>{}).finally(()=>{auditCSP.fetchFinished=true});`;
const contexts = [];
const browserErrors = [];
let browser;
let server;
let repository;
let directory;
let origin;
let handler;
let maximumBody;
let externalAttempts = 0;
function check(message) { console.log('✓ ' + message); }
async function settings(page) {
    if (!await page.locator('#settingsDialog').evaluate(node => node.open)) await page.locator('#settingsButton').click();
    if (!await page.locator('#deviceSyncPreferences').evaluate(node => node.open)) await page.locator('#deviceSyncPreferences > summary').click();
}
async function pageIn(context) {
    const page = await context.newPage();
    page.on('pageerror', issue => browserErrors.push(issue.message));
    await page.goto(origin + '/', { waitUntil: 'networkidle' });
    await page.locator('html[data-evportal-ready="true"]').waitFor({ state: 'visible' });
    return page;
}
async function context(options = {}) {
    const result = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'fr-FR', reducedMotion: 'reduce' });
    contexts.push(result);
    await result.addInitScript(({ fixture, corrupt }) => {
        if (location.protocol !== 'http:') return;
        if (!localStorage.getItem('evportal.state.v2')) localStorage.setItem('evportal.state.v2', JSON.stringify(fixture));
        if (corrupt) localStorage.setItem('evportal.backups.v1', '{synthetic-invalid-library');
        window.auditXSS = false;
    }, { fixture, corrupt: Boolean(options.corrupt) });
    await result.route('https://blocked.example/**', route => {
        externalAttempts += 1;
        return route.fulfill({ contentType: 'text/javascript', body: 'window.auditUnexpectedScript=true;' });
    });
    await result.route('https://api.telegra.ph/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, result: { pages: [], total_count: 0 } }) }));
    return result;
}
async function waitMessage(page, key) { await page.waitForFunction(key => document.getElementById('syncStatusMessage').textContent === EVI18n.t(key), key); }
function peerClient() { return Sync.createClient({ endpoint: origin + '/sync-api', storage: null, fetch: (url, options) => fetch(url, { ...options, headers: { ...options.headers, Origin: origin } }) }); }

(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'evportal-security-smoke-'));
    repository = fileRepository(path.join(directory, 'synthetic-profiles.json'));
    await repository.initialize();
    const protocol = await import('../sync/handler.mjs');
    maximumBody = protocol.MAX_BODY_BYTES;
    server = http.createServer(async (request, response) => {
        const send = (status, body, type = 'text/plain; charset=utf-8') => { response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' }); response.end(body); };
        try {
            if (!origin || request.headers.host !== new URL(origin).host) return send(403, 'Local test only');
            const url = new URL(request.url, origin);
            if (url.pathname.startsWith('/sync-api/')) {
                const chunks = []; let size = 0;
                for await (const chunk of request) { size += chunk.length; if (size > maximumBody) return send(413, '{}', 'application/json'); chunks.push(chunk); }
                const headers = new Headers();
                for (const [key, value] of Object.entries(request.headers)) if (value !== undefined && key !== 'host') headers.set(key, Array.isArray(value) ? value.join(',') : value);
                if (!headers.has('Origin') && ['GET', 'HEAD'].includes(request.method) && request.headers['sec-fetch-site'] === 'same-origin') headers.set('Origin', origin);
                const result = await handler(new Request(origin + request.url.slice('/sync-api'.length), { method: request.method, headers, body: ['GET', 'HEAD'].includes(request.method) ? undefined : Buffer.concat(chunks) }), 'synthetic-local-browser');
                response.writeHead(result.status, Object.fromEntries(result.headers));
                return response.end(Buffer.from(await result.arrayBuffer()));
            }
            if (url.pathname === '/js/config.js') return send(200, 'window.EV_CONFIG=Object.freeze({syncURL:window.location.origin+"/sync-api",localPreview:true});', mime['.js']);
            if (url.pathname === '/audit-probe.js') return send(200, probe, mime['.js']);
            let relative = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
            if (relative.endsWith('/')) relative += 'index.html';
            const filename = path.resolve(root, relative);
            if (!filename.startsWith(root + path.sep)) return send(404, 'Not found');
            return send(200, await fs.readFile(filename), mime[path.extname(filename)] || 'application/octet-stream');
        } catch (_) { return send(500, '{}', 'application/json'); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = 'http://127.0.0.1:' + server.address().port;
    handler = protocol.createHandler({ repository, allowedOrigins: [origin], createLimit: 50, rateLimit: 500 });
    try { browser = await chromium.launch({ headless: true, channel: process.env.EVPORTAL_TEST_BROWSER_CHANNEL || undefined }); }
    catch (issue) {
        if (process.platform !== 'win32' || process.env.EVPORTAL_TEST_BROWSER_CHANNEL) throw issue;
        browser = await chromium.launch({ headless: true, channel: 'msedge' });
    }

    const damaged = await context({ corrupt: true });
    const recovery = await pageIn(damaged);
    await recovery.locator('#settingsButton').click();
    assert.equal(await recovery.locator('#settingsDialog').evaluate(node => node.open), true);
    assert.ok(await recovery.evaluate(() => localStorage.getItem(EVBackups.STORAGE_KEY) === '{synthetic-invalid-library'), 'The invalid library must remain intact');
    assert.equal(await recovery.locator('#menu button').count() > 0, true);
    assert.equal(await recovery.locator('[data-shortcut-id="custom-audit"]').count(), 1);
    assert.equal(await recovery.evaluate(() => window.auditXSS), false);
    assert.equal(await recovery.locator('[data-shortcut-id="custom-audit"] svg[onload], [data-shortcut-id="custom-audit"] img[onerror]').count(), 0);
    check('A corrupt backup library preserves its bytes and leaves saved shortcuts and settings usable');
    check('Imported HTML-like names stay inert text without creating executable elements');

    await recovery.evaluate(url => new Promise((resolve, reject) => {
        const script = document.createElement('script'); script.src = url;
        script.onload = () => resolve(); script.onerror = () => reject(new Error('The same-origin security probe was blocked'));
        document.head.append(script);
    }), origin + '/audit-probe.js');
    await recovery.waitForFunction(() => auditCSP.fetchFinished && auditCSP.violations.length >= 4);
    const security = await recovery.evaluate(() => ({ ...auditCSP, referrer: document.querySelector('meta[name="referrer"]').content }));
    assert.equal(security.inlineRan, false);
    assert.equal(security.evalRan, false);
    assert.equal(security.evalBlocked, true);
    assert.ok(security.violations.includes('connect-src'));
    assert.ok(security.violations.some(name => name.startsWith('script-src')));
    assert.equal(security.referrer, 'no-referrer');
    assert.equal(externalAttempts, 0, 'CSP must reject the third-party attempts before routing or sending a request');
    check('CSP allows application scripts and blocks inline code, eval and unauthorized third-party scripts/connections before any network request');

    const shared = await context();
    const first = await pageIn(shared);
    assert.ok(await first.evaluate(() => EVI18n.t('upgrade.revokeConfirm') !== 'upgrade.revokeConfirm'), 'Rebuild translations before this check');
    await settings(first);
    await first.locator('#rememberSyncConnection').check();
    await first.locator('#createSyncProfile').click();
    await waitMessage(first, 'upgrade.saved');
    const initialCode = await first.locator('#syncRecoveryCode').inputValue();
    assert.ok(/^EV1\.[A-Za-z0-9_-]{43}$/.test(initialCode), 'A synthetic recovery code was created');
    assert.equal(await first.locator('#syncRecoveryCode').getAttribute('type'), 'password');
    await first.locator('#revealSyncCode').click();
    assert.equal(await first.locator('#syncRecoveryCode').getAttribute('type'), 'text');
    await first.locator('#settingsDialog .dialog-heading [data-close-dialog]').click();
    await settings(first);
    assert.equal(await first.locator('#syncRecoveryCode').getAttribute('type'), 'password');
    const second = await pageIn(shared);
    await settings(second);
    await second.locator('#loadSyncProfile').click();
    await second.locator('#syncRemotePreview').waitFor({ state: 'visible' });
    await second.locator('#keepLocalSyncProfile').click();
    await first.locator('#disconnectSyncProfile').click();
    await second.waitForFunction(() => !document.getElementById('createSyncProfile').closest('div').hidden);
    assert.ok((await second.locator('#syncRecoveryCode').inputValue()) === '', 'Logout must clear the peer input');
    assert.ok(await second.evaluate(() => localStorage.getItem(EVSync.STORAGE_KEY) === null), 'Logout must remove the remembered code');
    await second.reload({ waitUntil: 'networkidle' });
    await second.locator('html[data-evportal-ready="true"]').waitFor(); await settings(second);
    assert.equal(await second.locator('#createSyncProfile').isVisible(), true);
    assert.ok((await second.locator('#syncRecoveryCode').inputValue()) === '', 'Reload must not revive the private code');
    const initialCleanup = peerClient(); await initialCleanup.connect(initialCode); await initialCleanup.deleteProfile(); initialCleanup.close();
    check('UI logout scrubs a loaded sibling tab and the private code stays absent after reload');

    await first.locator('#createSyncProfile').click();
    await waitMessage(first, 'upgrade.saved');
    const revokedCode = await first.locator('#syncRecoveryCode').inputValue();
    const independent = peerClient(); await independent.connect(revokedCode);
    const before = await first.evaluate(() => JSON.stringify(EVState.normalizeState(JSON.parse(localStorage.getItem(EVState.STORAGE_KEY)))));
    first.once('dialog', dialog => dialog.accept());
    await first.locator('#deleteSyncProfile').click();
    await waitMessage(first, 'upgrade.revoked');
    await assert.rejects(independent.load(), issue => issue.code === 'UNAUTHORIZED');
    independent.close();
    assert.ok(await first.evaluate(value => JSON.stringify(EVState.normalizeState(JSON.parse(localStorage.getItem(EVState.STORAGE_KEY)))) === value, before), 'Revocation must preserve current shortcuts');
    assert.ok((await first.locator('#syncRecoveryCode').inputValue()) === '', 'Revocation must scrub the recovery code');
    assert.ok(await first.evaluate(() => localStorage.getItem(EVSync.STORAGE_KEY) === null), 'Revocation must remove remembered credentials');
    check('Confirmed UI revocation removes the synthetic profile, rejects its old code and preserves current shortcuts');
    await first.goto(origin + '/aide.html', { waitUntil: 'networkidle' });
    await first.locator('#languageSelect').selectOption('en');
    assert.equal(await first.locator('html').getAttribute('lang'), 'en');
    assert.equal(await first.locator('meta[name="referrer"]').getAttribute('content'), 'no-referrer');
    assert.equal(await first.locator('script:not([src]):not([type="application/ld+json"])').count(), 0);
    check('The help page keeps its language selector and theme initialization with executable scripts kept external');
    assert.deepEqual(browserErrors, [], 'The browser must have no unhandled exceptions');
    console.log('Security smoke checks passed. No screenshot, private code or external publication was produced.');
})().catch(issue => { console.error(issue.stack || issue.message); process.exitCode = 1; }).finally(async () => {
    for (const value of contexts) await value.close();
    if (browser) await browser.close();
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (repository) await repository.close();
    if (directory) await fs.rm(directory, { recursive: true });
});
