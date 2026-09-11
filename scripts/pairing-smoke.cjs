/* Bidirectional browser transfer into a backup library; real QR/crypto, mocked relay. */
'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const jsQR = require('jsqr');
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
let nextTTL = 300000, nextID = 1, dropNextSendResponse = false, nextSendDelay = 0, browser;
async function readQR(page, id) {
    await page.locator('#' + id).waitFor({ state: 'visible' });
    const pixels = await page.locator('#' + id + ' canvas').evaluate(canvas => ({ width: canvas.width, height: canvas.height,
        data: Array.from(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data) }));
    const result = jsQR(Uint8ClampedArray.from(pixels.data), pixels.width, pixels.height);
    assert.ok(result, 'QR must decode');
    return result.data;
}
(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const appURL = origin + '/EvPortal/';
    browser = await chromium.launch({ headless: true, channel: 'chromium' });
    async function context(state, mobile) {
        const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, locale: 'fr-FR', isMobile: Boolean(mobile), hasTouch: Boolean(mobile), reducedMotion: 'reduce' });
        context.on('page', page => page.on('pageerror', error => pageErrors.push(error.message)));
        await context.addInitScript(({ initial, mobile, savedBackup }) => {
            if (!/^https?:$/.test(location.protocol)) return;
            if (!localStorage.getItem('evportal.state.v2')) localStorage.setItem('evportal.state.v2', JSON.stringify(initial));
            localStorage.setItem('evportal.telegraph.v1', JSON.stringify({ version: 1, accessToken: 'private-account-token-not-for-relay' }));
            if (!localStorage.getItem('evportal.preferences.v1')) localStorage.setItem('evportal.preferences.v1', JSON.stringify({ version: 1, market: mobile ? 'CA' : 'FR', homeFavorites: Boolean(mobile), hiddenCategoryIds: mobile ? ['personal'] : [] }));
            if (mobile && !localStorage.getItem('evportal.backups.v1')) localStorage.setItem('evportal.backups.v1', JSON.stringify({ version: 1, backups: [{ id: 'saved-phone', title: 'Ma sauvegarde locale', createdAt: Date.now(), source: 'created', state: savedBackup }] }));
        }, { initial: state, mobile: Boolean(mobile), savedBackup: backup });
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
                    if (nextSendDelay) {
                        const delay = nextSendDelay; nextSendDelay = 0;
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
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
    const phoneOriginal = await phone.evaluate(() => localStorage.getItem(EVState.STORAGE_KEY));
    await phone.goto(qrURL, { waitUntil: 'networkidle' });
    await phone.locator('#pairSendDialog').waitFor({ state: 'visible' });
    assert.equal(new URL(phone.url()).hash, '');
    assert.equal(await phone.locator('#pairSendDialog').evaluate(dialog => dialog.open), true);
    assert.match(await phone.locator('#pairSendSummary').textContent(), /1 catégorie/);
    assert.equal(calls.filter(call => call.method === 'PUT').length, 0, 'Scanning alone never sends');
    await phone.locator('#pairChooseBackupButton').click();
    await phone.locator('#localBackupList .backup-select').filter({ hasText: 'Ma sauvegarde locale' }).click();
    await phone.locator('#confirmRestoreButton').click();
    await phone.locator('#pairSendDialog').waitFor({ state: 'visible' });
    assert.equal(await phone.evaluate(() => localStorage.getItem(EVState.STORAGE_KEY)), phoneOriginal, 'Choosing a backup for sending must not restore it on the phone');
    // Cancelling a second selection keeps the first selection in memory.
    await phone.locator('#pairChooseBackupButton').click();
    await phone.locator('#restoreDialog [data-close-dialog]').first().click();
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
    const libraryBefore = await receiver.evaluate(() => localStorage.getItem(EVBackups.STORAGE_KEY));
    await receiver.evaluate(() => {
        window.testSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
            if (key === EVBackups.STORAGE_KEY) throw new DOMException('Quota exceeded', 'QuotaExceededError');
            return window.testSetItem.call(this, key, value);
        };
    });
    await receiver.locator('#pairApplyButton').click();
    await receiver.locator('#pairReceiveError').waitFor({ state: 'visible' });
    assert.equal(await receiver.evaluate(() => localStorage.getItem(EVBackups.STORAGE_KEY)), libraryBefore);
    assert.equal(await receiver.evaluate(() => localStorage.getItem(EVState.STORAGE_KEY)), original);
    await receiver.evaluate(() => { Storage.prototype.setItem = window.testSetItem; delete window.testSetItem; });
    await receiver.locator('#pairApplyButton').click();
    await receiver.locator('#restoreDialog').waitFor({ state: 'visible' });
    const added = await receiver.evaluate(() => EVBackups.createLibrary().list());
    assert.equal(added.length, 1);
    assert.deepEqual(added[0].state.categories, backup.categories);
    assert.deepEqual(added[0].state.shortcutOrder, backup.shortcutOrder);
    assert.equal(added[0].source, 'transfer');
    assert.equal(await receiver.evaluate(() => localStorage.getItem(EVState.STORAGE_KEY)), original, 'Adding a received backup must not replace the dashboard');
    assert.equal(await receiver.evaluate(() => localStorage.getItem(EVPreferences.STORAGE_KEY)), receiverPreferences, 'Phone country, home and hidden categories never replace receiver preferences');
    for (const key of ['market', 'homeFavorites', 'hiddenCategoryIds']) assert.equal(Object.hasOwn(added[0].state, key), false);
    assert.equal(await receiver.locator('#pairReceiveDialog').evaluate(dialog => dialog.open), false);
    assert.equal(firstSession.deleted, true);
    await receiver.locator('#restoreDialog [data-close-dialog]').first().click();
    assert.equal(await phone.evaluate(() => localStorage.getItem(EVState.STORAGE_KEY)), phoneOriginal);
    console.log('✓ Phone selects a backup without restoring it, sends ciphertext and Tesla saves only to its library; quota retry preserves both dashboards');

    await phone.locator('#pairSendDialog [data-close-dialog]').first().click();
    await receiver.locator('#settingsButton').click();
    await receiver.locator('#pairOfferButton').click();
    const offeredURL = await readQR(receiver, 'pairOfferQRCode');
    assert.ok(offeredURL.startsWith(appURL + '#download='));
    const offeredSession = Array.from(sessions.values()).at(-1);
    const readerCredentials = await receiver.evaluate(hash => EVPairing.parseDownloadFragment(hash), new URL(offeredURL).hash);
    assert.equal(readerCredentials.token, offeredSession.receiveToken);
    assert.ok(!JSON.stringify(readerCredentials).includes(offeredSession.sendToken));
    assert.ok(offeredSession.payload, 'QR must appear only after the encrypted deposit');
    const originalOfferPayload = offeredSession.payload;
    const decodedOffer = await receiver.evaluate(async ({ payload, credentials }) => EVPairing.decryptState(payload, credentials.key, credentials.id), { payload: originalOfferPayload, credentials: readerCredentials });
    assert.deepEqual(decodedOffer, JSON.parse(original));
    await phone.goto(offeredURL);
    await phone.locator('#pairApplyButton').waitFor({ state: 'visible' });
    assert.equal(await phone.locator('#pairReceiveSteps').isHidden(), true);
    assert.equal(await phone.locator('#pairReceiveQRCode').isHidden(), true);
    assert.equal(new URL(phone.url()).hash, '');
    assert.equal(await phone.evaluate(() => localStorage.getItem(EVState.STORAGE_KEY)), phoneOriginal);
    await phone.locator('#pairApplyButton').click();
    await phone.locator('#restoreDialog').waitFor({ state: 'visible' });
    const phoneLibrary = await phone.evaluate(() => EVBackups.createLibrary().list());
    assert.equal(phoneLibrary.length, 2);
    assert.deepEqual(phoneLibrary.find(item => item.source === 'transfer').state, JSON.parse(original));
    assert.equal(await phone.evaluate(() => localStorage.getItem(EVState.STORAGE_KEY)), phoneOriginal);
    assert.equal(offeredSession.deleted, true);
    await phone.locator('#restoreDialog [data-close-dialog]').first().click();
    console.log('✓ Reverse QR exposes only read credentials; phone downloads and adds the Tesla snapshot without applying it');

    await receiver.locator('#pairOfferChooseBackupButton').click();
    await receiver.locator('#localBackupList .backup-select').first().click();
    await receiver.locator('#confirmRestoreButton').click();
    const chosenURL = await readQR(receiver, 'pairOfferQRCode');
    assert.notEqual(chosenURL, offeredURL);
    assert.equal(await receiver.evaluate(() => localStorage.getItem(EVState.STORAGE_KEY)), original, 'Choosing an offered backup never restores the emitter dashboard');
    await phone.goto(chosenURL);
    await phone.locator('#pairApplyButton').waitFor({ state: 'visible' });
    await phone.locator('#pairApplyButton').click();
    await phone.locator('#restoreDialog').waitFor({ state: 'visible' });
    const withChosen = await phone.evaluate(() => EVBackups.createLibrary().list());
    assert.equal(withChosen.length, 3);
    assert.ok(withChosen.some(item => item.source === 'transfer' && item.state.categories[0].shortcuts[0].name === backup.categories[0].shortcuts[0].name));
    assert.equal(await phone.evaluate(() => localStorage.getItem(EVState.STORAGE_KEY)), phoneOriginal);
    await phone.locator('#localBackupList .backup-select').first().click();
    await phone.locator('#confirmRestoreButton').click();
    await phone.locator('#restoreDialog').waitFor({ state: 'hidden' });
    assert.equal((await phone.evaluate(() => JSON.parse(localStorage.getItem(EVState.STORAGE_KEY)))).categories[0].shortcuts[0].name, backup.categories[0].shortcuts[0].name);
    assert.equal(await receiver.evaluate(() => localStorage.getItem(EVState.STORAGE_KEY)), original);
    await phone.goto(chosenURL);
    await phone.locator('#pairReceiveError[data-i18n="pair.downloadExpired"]').waitFor({ state: 'visible' });
    assert.equal(await phone.locator('#pairApplyButton').isHidden(), true);
    assert.equal((await phone.evaluate(() => EVBackups.createLibrary().list())).length, 3);
    await phone.locator('#pairReceiveDialog [data-close-dialog]').first().click();
    await receiver.locator('#pairOfferDialog [data-close-dialog]').first().click();
    console.log('✓ Offered backup selection preserves the emitter, consumed links cannot be reused, and only library Restore applies a backup');

    nextTTL = 700;
    await receiver.locator('#settingsButton').click();
    await receiver.locator('#pairOfferButton').click();
    await receiver.locator('#pairOfferError[data-i18n="pair.offerExpired"]').waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await receiver.locator('#pairOfferQRCode').isHidden(), true);
    assert.equal(await receiver.locator('#pairOfferNewButton').isVisible(), true);
    await receiver.locator('#pairOfferNewButton').click();
    await readQR(receiver, 'pairOfferQRCode');
    const cancelledOffer = Array.from(sessions.values()).at(-1);
    await receiver.locator('#pairOfferDialog [data-close-dialog]').first().click();
    await receiver.waitForTimeout(100);
    assert.equal(cancelledOffer.deleted, true);
    assert.equal(await receiver.evaluate(() => localStorage.getItem(EVState.STORAGE_KEY)), original);
    console.log('✓ Offer expiration clears its QR; renewing and cancelling remove the old relay capability without changing the dashboard');

    nextSendDelay = 500;
    await receiver.locator('#settingsButton').click();
    const uploadPromise = receiver.waitForRequest(request => request.url().startsWith(relay) && request.method() === 'PUT');
    await receiver.locator('#pairOfferButton').click();
    const uploadInFlight = await uploadPromise;
    const interruptedOffer = sessions.get(new URL(uploadInFlight.url()).pathname.split('/').pop());
    await receiver.locator('#pairOfferDialog [data-close-dialog]').first().click();
    await receiver.waitForTimeout(600);
    assert.equal(interruptedOffer.deleted, true);
    assert.equal(await receiver.locator('#pairOfferQRCode').isHidden(), true);
    assert.equal(await receiver.locator('#pairOfferDialog').isHidden(), true);
    await receiver.locator('#settingsButton').click();
    await receiver.locator('#pairOfferButton').click();
    await readQR(receiver, 'pairOfferQRCode');
    await receiver.evaluate(() => {
        window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    assert.equal(await receiver.locator('#pairOfferDialog').isHidden(), true);
    assert.equal(await receiver.locator('#pairOfferQRCode').isHidden(), true);
    console.log('✓ Cancelling an in-flight offer prevents stale QR publication; page-cache restoration leaves no offer credentials on screen');

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
    assert.equal(await receiver.evaluate(() => localStorage.getItem(EVState.STORAGE_KEY)), original);
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
