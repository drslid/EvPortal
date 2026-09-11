/* npm run dev must already serve the actual portal and Worker. No production requests or configuration overrides. */
'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const jsQR = require('jsqr');
const PORTAL = process.env.PORTAL_URL || 'http://127.0.0.1:4187/';
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(PORTAL).hostname), 'This recipe only targets a local portal');
const errors = [];
let browser;
const fixture = name => ({ version: 2, theme: 'dark', activeCategory: 'test-category', categories: [{ id: 'test-category', label: 'Essai local', icon: 'charging', shortcuts: [{ id: 'test-link', name, url: 'https://example.org/local-transfer', favorite: true, clickCount: 4 }] }] });
const active = page => page.evaluate(() => localStorage.getItem(EVState.STORAGE_KEY));
const library = page => page.evaluate(() => EVBackups.createLibrary().list());
const close = (page, id) => page.locator('#' + id + ' [data-close-dialog]').first().click();
async function qr(page, id) {
    await page.locator('#' + id).waitFor({ state: 'visible' });
    const pixels = await page.locator('#' + id + ' canvas').evaluate(canvas => ({ width: canvas.width, height: canvas.height,
        data: Array.from(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data) }));
    const code = jsQR(Uint8ClampedArray.from(pixels.data), pixels.width, pixels.height);
    assert.ok(code, 'QR must decode');
    assert.equal(new URL(code.data).origin, new URL(PORTAL).origin);
    assert.equal(new URL(code.data).pathname, new URL(PORTAL).pathname, 'QR preserves the localized portal route');
    return code.data;
}
async function axe(page) {
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
    const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })).violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })));
    assert.deepEqual(violations, []);
}
(async () => {
    browser = await chromium.launch({ headless: true, channel: 'chromium' });
    const car = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR' });
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR', isMobile: true, hasTouch: true });
    for (const context of [car, mobile]) context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    async function pageFor(context, initial) {
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        await page.goto(PORTAL, { waitUntil: 'networkidle' });
        assert.equal(await page.evaluate(() => EV_CONFIG.pairingRelayURL), 'http://127.0.0.1:8787');
        await page.evaluate(state => localStorage.setItem(EVState.STORAGE_KEY, JSON.stringify(EVState.normalizeState(state))), initial);
        await page.reload({ waitUntil: 'networkidle' });
        return page;
    }
    const receiver = await pageFor(car, fixture('Écran initial'));
    const phone = await pageFor(mobile, fixture('Test téléphone chiffré'));
    const receiverBefore = await active(receiver), phoneBefore = await active(phone);
    await receiver.locator('#settingsButton').click();
    await receiver.locator('#pairReceiveButton').click();
    const sendURL = await qr(receiver, 'pairReceiveQRCode');
    assert.ok(new URL(sendURL).hash.startsWith('#receive='));
    await axe(receiver);
    await phone.goto(sendURL);
    await phone.locator('#pairSendDialog').waitFor({ state: 'visible' });
    assert.equal(new URL(phone.url()).hash, '');
    await phone.locator('#pairSendButton').click();
    await receiver.locator('#pairApplyButton').waitFor({ state: 'visible' });
    assert.equal(await active(receiver), receiverBefore);
    assert.equal((await library(receiver)).length, 0);
    await receiver.evaluate(() => {
        window.originalSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
            if (key === EVBackups.STORAGE_KEY) throw new DOMException('Quota exceeded', 'QuotaExceededError');
            return window.originalSetItem.call(this, key, value);
        };
    });
    await receiver.locator('#pairApplyButton').click();
    await receiver.locator('#pairReceiveError').waitFor({ state: 'visible' });
    assert.equal(await active(receiver), receiverBefore);
    assert.equal((await library(receiver)).length, 0);
    await receiver.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; delete window.originalSetItem; });
    await receiver.locator('#pairApplyButton').click();
    await receiver.locator('#restoreDialog').waitFor({ state: 'visible' });
    assert.equal(await active(receiver), receiverBefore);
    assert.deepEqual((await library(receiver))[0].state.categories, JSON.parse(phoneBefore).categories);
    await axe(receiver);
    await receiver.locator('#localBackupList .backup-select').first().click();
    const recoveryBefore = await receiver.evaluate(() => localStorage.getItem('evportal.previous-transfer.v1'));
    await receiver.evaluate(() => {
        window.originalSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
            if (key === EVState.STORAGE_KEY) throw new DOMException('Quota exceeded', 'QuotaExceededError');
            return window.originalSetItem.call(this, key, value);
        };
    });
    await receiver.locator('#confirmRestoreButton').click();
    await receiver.locator('#restoreError').waitFor({ state: 'visible' });
    assert.equal(await active(receiver), receiverBefore);
    assert.equal(await receiver.evaluate(() => localStorage.getItem('evportal.previous-transfer.v1')), recoveryBefore);
    await receiver.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; delete window.originalSetItem; });
    await receiver.locator('#confirmRestoreButton').click();
    await receiver.locator('#restoreDialog').waitFor({ state: 'hidden' });
    assert.deepEqual(JSON.parse(await active(receiver)).categories, JSON.parse(phoneBefore).categories);
    await receiver.reload({ waitUntil: 'networkidle' });
    assert.deepEqual(JSON.parse(await active(receiver)).categories, JSON.parse(phoneBefore).categories);
    console.log('✓ Real local Worker: phone QR sends into the library; Add never restores; quota retries and explicit Restore persist correctly');

    await close(phone, 'pairSendDialog');
    await receiver.locator('#settingsButton').click();
    await receiver.locator('#pairOfferButton').click();
    const downloadURL = await qr(receiver, 'pairOfferQRCode');
    assert.ok(new URL(downloadURL).hash.startsWith('#download='));
    await axe(receiver);
    await phone.goto(downloadURL);
    await phone.locator('#pairApplyButton').waitFor({ state: 'visible' });
    assert.equal(await phone.locator('#pairReceiveSteps').isHidden(), true);
    assert.equal(await active(phone), phoneBefore);
    await axe(phone);
    await phone.locator('#pairApplyButton').click();
    await phone.locator('#restoreDialog').waitFor({ state: 'visible' });
    assert.equal(await active(phone), phoneBefore);
    assert.equal((await library(phone)).length, 1);
    assert.deepEqual((await library(phone))[0].state.categories, JSON.parse(phoneBefore).categories);
    await close(phone, 'restoreDialog');
    await phone.goto(downloadURL);
    await phone.locator('#pairReceiveError[data-i18n="pair.downloadExpired"]').waitFor({ state: 'visible' });
    assert.equal((await library(phone)).length, 1);
    assert.equal(await phone.locator('#pairApplyButton').isHidden(), true);
    await close(receiver, 'pairOfferDialog');
    await receiver.locator('#settingsButton').click();
    await receiver.locator('#undoTransferButton').evaluate(button => { button.closest('details').open = true; });
    await receiver.locator('#undoTransferButton').click();
    assert.deepEqual(JSON.parse(await active(receiver)).categories, JSON.parse(receiverBefore).categories);
    assert.deepEqual(errors, []);
    console.log('✓ Real local reverse QR downloads once into phone backups; consumed QR expires, Undo restores the prior dashboard, and new dialogs pass accessibility checks');
})().catch(error => {
    const safe = String(error.message || error).split('\n')[0].replace(/#(?:receive|download)=[^\s"'<>]+/g, '#transfer=[redacted]').replace(/\b[a-f0-9]{32,}\b/gi, '[redacted]');
    console.error(safe); process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); });
