/* Two real browser contexts; QR decoding and encryption are real, relay/Telegra.ph are mocked. */
'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const Core = require('../js/state.js');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };
const server = http.createServer(async (request, response) => {
    try {
        const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/EvPortal\//, '').replace(/^\//, '') || 'index.html';
        const filename = path.resolve(root, relative);
        if (!filename.startsWith(root + path.sep)) throw new Error('Invalid path');
        response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream' });
        response.end(await fs.readFile(filename));
    } catch (_) { response.writeHead(404); response.end('Not found'); }
});
const fixture = name => Core.normalizeState({ version: 2, theme: 'dark', activeCategory: 'personal', categories: [{ id: 'personal', label: 'Mes pauses', icon: 'charging', shortcuts: [{ id: 'one', name, url: 'https://example.org/' + encodeURIComponent(name), favorite: true, clickCount: 9 }] }] });
const backup = fixture('Sauvegarde téléphone');
const relay = 'https://relay.evportal.test';
const sessions = new Map();
const calls = [], pageErrors = [], unexpected = [];
let nextTTL = 300000, nextID = 1, dropNextSendResponse = false, browser;
(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const appURL = origin + '/EvPortal/';
    browser = await chromium.launch({ headless: true, channel: 'chromium' });
    async function context(state, mobile) {
        const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, locale: 'fr-FR', isMobile: Boolean(mobile), hasTouch: Boolean(mobile), reducedMotion: 'reduce' });
        context.on('page', page => page.on('pageerror', error => pageErrors.push(error.message)));
        await context.addInitScript(({ initial, mobile }) => {
            if (!/^https?:$/.test(location.protocol)) return;
            if (!localStorage.getItem('evportal.state.v2')) localStorage.setItem('evportal.state.v2', JSON.stringify(initial));
            localStorage.setItem('evportal.telegraph.v1', JSON.stringify({ version: 1, accessToken: 'private-account-token-not-for-relay' }));
            if (!localStorage.getItem('evportal.preferences.v1')) localStorage.setItem('evportal.preferences.v1', JSON.stringify({ version: 1, market: mobile ? 'CA' : 'FR', homeFavorites: Boolean(mobile), hiddenCategoryIds: mobile ? ['personal'] : [] }));
        }, { initial: state, mobile: Boolean(mobile) });
        await context.route('**/*', async route => {
            const request = route.request(), url = new URL(request.url());
            if (url.origin === origin && url.pathname.endsWith('/js/config.js')) return route.fulfill({ contentType: 'text/javascript', body: 'window.EV_CONFIG=Object.freeze({pairingRelayURL:' + JSON.stringify(relay) + '});' });
            if (url.origin === origin) return route.continue();
            if (url.origin === 'https://api.telegra.ph') {
                if (url.pathname === '/getPageList') return route.fulfill({ json: { ok: true, result: { total_count: 1, pages: [{ path: 'Saved-09-11', title: 'Ma sauvegarde' }] } } });
                if (url.pathname === '/getPage/Saved-09-11') return route.fulfill({ json: { ok: true, result: { content: [{ tag: 'pre', children: [JSON.stringify(backup)] }] } } });
            }
            if (url.origin === relay) {
                const method = request.method();
                const body = request.postData() ? JSON.parse(request.postData()) : null;
                calls.push({ method, url: url.href, body, authorization: request.headers().authorization || '' });
                if (method === 'POST') {
                    const id = (nextID++).toString(16).padStart(32, '0');
                    const created = { id, receiveToken: 'b'.repeat(64), sendToken: 'c'.repeat(64), expiresAt: Date.now() + nextTTL };
                    sessions.set(id, { ...created, payload: null, deleted: false });
                    nextTTL = 300000;
                    return route.fulfill({ json: created });
                }
                const session = sessions.get(url.pathname.split('/').pop());
                if (!session || session.deleted || session.expiresAt <= Date.now()) return route.fulfill({ status: 410, json: { error: 'expired' } });
                const expected = method === 'PUT' ? session.sendToken : session.receiveToken;
                assert.equal(request.headers().authorization, 'Bearer ' + expected);
                if (method === 'GET') return route.fulfill({ json: { status: session.payload ? 'ready' : 'waiting', expiresAt: session.expiresAt, ...(session.payload ? { payload: session.payload } : {}) } });
                if (method === 'PUT') {
                    session.payload = body;
                    if (dropNextSendResponse) { dropNextSendResponse = false; return route.abort(); }
                    return route.fulfill({ json: { status: 'sent' } });
                }
                if (method === 'DELETE') { session.deleted = true; return route.fulfill({ status: 204 }); }
            }
            unexpected.push(url.href);
            return route.abort();
        });
        return context;
    }
    const receiverContext = await context(fixture('Ancienne Tesla'));
    const receiver = await receiverContext.newPage();
    await receiver.goto(appURL, { waitUntil: 'networkidle' });
    assert.equal(calls.length, 0, 'No relay account/session request on startup');
    await receiver.locator('#settingsButton').click();
    await receiver.locator('#pairReceiveButton').click();
    await receiver.locator('#pairReceiveQRCode').waitFor({ state: 'visible' });
    assert.equal(await receiver.locator('#settingsDialog').evaluate(dialog => dialog.open), false);
    await receiver.addScriptTag({ path: require.resolve('jsqr') });
    const qrURL = await receiver.evaluate(() => {
        const canvas = document.querySelector('#pairReceiveQRCode canvas');
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
        return jsQR(pixels.data, pixels.width, pixels.height).data;
    });
    assert.ok(qrURL.startsWith(appURL + '#receive='));
    const firstSession = Array.from(sessions.values())[0];
    const credentials = await receiver.evaluate(hash => EVPairing.parseFragment(hash), new URL(qrURL).hash);
    assert.equal(credentials.token, firstSession.sendToken);
    assert.equal(credentials.receiveToken, undefined);
    const original = await receiver.evaluate(() => localStorage.getItem(EVState.STORAGE_KEY));
    const receiverPreferences = await receiver.evaluate(() => localStorage.getItem(EVPreferences.STORAGE_KEY));
    const phoneContext = await context(fixture('Téléphone initial'), true);
    const phone = await phoneContext.newPage();
    await phone.goto(appURL, { waitUntil: 'networkidle' });
    await phone.goto(qrURL, { waitUntil: 'networkidle' });
    await phone.locator('#pairSendDialog').waitFor({ state: 'visible' });
    assert.equal(new URL(phone.url()).hash, '');
    assert.equal(await phone.locator('#pairSendDialog').evaluate(dialog => dialog.open), true);
    assert.match(await phone.locator('#pairSendSummary').textContent(), /1 catégorie/);
    assert.equal(calls.filter(call => call.method === 'PUT').length, 0, 'Scanning alone never sends');
    await phone.locator('#pairChooseBackupButton').click();
    await phone.getByRole('button', { name: 'Ma sauvegarde', exact: true }).click();
    await phone.locator('#confirmImportButton').waitFor({ state: 'visible' });
    await phone.locator('#confirmImportButton').click();
    await phone.locator('#pairSendDialog').waitFor({ state: 'visible' });
    assert.equal(await phone.locator('#pairSendButton').isEnabled(), true);
    assert.equal(calls.filter(call => call.method === 'PUT').length, 0);
    await phone.locator('#pairSendButton').click();
    await phone.locator('#pairSendStatus[data-i18n="pair.sent"]').waitFor();
    const uploaded = calls.find(call => call.method === 'PUT');
    assert.deepEqual(Object.keys(uploaded.body).sort(), ['ciphertext', 'iv']);
    assert.ok(!JSON.stringify(uploaded.body).includes('Sauvegarde'));
    assert.ok(!JSON.stringify(calls).includes('private-account-token-not-for-relay'));
    assert.ok(!JSON.stringify(calls).includes(credentials.key));
    await receiver.locator('#pairApplyButton').waitFor({ state: 'visible', timeout: 10000 });
    assert.equal(await receiver.locator('#pairReceiveQRCode').isVisible(), false);
    assert.equal(await receiver.locator('#pairReceiveQRCode').getAttribute('title'), null);
    assert.equal(await receiver.evaluate(() => localStorage.getItem(EVState.STORAGE_KEY)), original, 'Receiving previews without replacing current settings');
    await receiver.locator('#pairApplyButton').click();
    const applied = await receiver.evaluate(() => JSON.parse(localStorage.getItem(EVState.STORAGE_KEY)));
    assert.equal(applied.categories[0].shortcuts[0].name, backup.categories[0].shortcuts[0].name);
    assert.equal(applied.categories[0].shortcuts[0].clickCount, 9);
    assert.equal(applied.categories[0].icon, 'charging');
    assert.equal(applied.account, undefined);
    assert.equal(await receiver.evaluate(() => localStorage.getItem(EVPreferences.STORAGE_KEY)), receiverPreferences, 'Phone country, home and hidden categories never replace receiver preferences');
    for (const key of ['market', 'homeFavorites', 'hiddenCategoryIds']) assert.equal(Object.hasOwn(applied, key), false);
    assert.equal(await receiver.locator('#pairReceiveDialog').evaluate(dialog => dialog.open), false);
    await receiver.waitForFunction(() => document.querySelector('#statusMessage').textContent.includes('transférés'));
    assert.equal(firstSession.deleted, true);
    console.log('✓ Real QR decodes; phone restores a named backup and explicitly sends ciphertext; Tesla previews before applying and acknowledges relay deletion');

    await receiver.locator('#settingsButton').click();
    await receiver.locator('#pairReceiveButton').click();
    await receiver.locator('#pairReceiveQRCode').waitFor({ state: 'visible' });
    const cancelled = Array.from(sessions.values()).at(-1);
    await receiver.locator('#pairReceiveDialog [data-close-dialog]').click();
    await receiver.waitForTimeout(2300);
    assert.equal(cancelled.deleted, true);
    assert.equal(calls.filter(call => call.method === 'GET' && call.url.endsWith(cancelled.id)).length, 0);
    assert.equal(await receiver.locator('#pairReceiveQRCode').isVisible(), false);
    nextTTL = 700;
    await receiver.locator('#settingsButton').click();
    await receiver.locator('#pairReceiveButton').click();
    await receiver.locator('#pairReceiveError[data-i18n="pair.receiverExpired"]').waitFor({ timeout: 5000 });
    assert.equal(await receiver.locator('#pairReceiveQRCode').isVisible(), false);
    assert.equal(await receiver.locator('#pairNewButton').isVisible(), true);
    assert.equal(await receiver.locator('#pairApplyButton').isVisible(), false);
    assert.equal((await receiver.evaluate(() => JSON.parse(localStorage.getItem(EVState.STORAGE_KEY)))).categories[0].shortcuts[0].name, backup.categories[0].shortcuts[0].name);
    console.log('✓ Closing a receiver cancels polling and deletes its session; expiration removes QR and keeps current settings');
    await receiver.locator('#pairNewButton').click();
    await receiver.locator('#pairReceiveQRCode').waitFor({ state: 'visible' });
    await receiver.evaluate(() => {
        window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    assert.equal(await receiver.locator('#pairReceiveDialog').evaluate(dialog => dialog.open), false);
    assert.equal(await receiver.locator('#pairReceiveQRCode').isVisible(), false);

    await receiver.locator('#settingsButton').click();
    await receiver.locator('#pairReceiveButton').click();
    await receiver.locator('#pairReceiveQRCode').waitFor({ state: 'visible' });
    const nextQR = await receiver.evaluate(() => {
        const canvas = document.querySelector('#pairReceiveQRCode canvas');
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
        return jsQR(pixels.data, pixels.width, pixels.height).data;
    });
    await phone.goto(nextQR);
    await phone.locator('#pairSendDialog').waitFor({ state: 'visible' });
    dropNextSendResponse = true;
    await phone.locator('#pairSendButton').click();
    await phone.locator('#pairSendError[data-i18n="pair.networkError"]').waitFor();
    await receiver.locator('#pairApplyButton').waitFor({ state: 'visible', timeout: 10000 });
    await phone.locator('#pairSendButton').click();
    await phone.locator('#pairSendError[data-i18n="pair.deliveryUnknown"]').waitFor();
    assert.equal(await phone.locator('#pairSendButton').isDisabled(), true);
    assert.equal(await receiver.locator('#pairApplyButton').isVisible(), true);
    console.log('✓ Returning from page cache clears stale dialogs; a lost send response followed by relay deletion reports uncertain delivery without claiming failure');
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(unexpected, []);
    await receiverContext.close();
    await phoneContext.close();
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
});
