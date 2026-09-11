/*
 * Explicit production check: run only after the deployment has been approved.
 * node scripts/production-smoke.cjs [--frontend-only]
 * Uses the deployed configuration and unmodified QR. Creates one short-lived
 * relay session with synthetic data, then verifies its deletion. No Telegra.ph
 * publication, account credentials, screenshots, traces, or persistent profile.
 */
'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const jsQR = require('jsqr');

const PORTAL = 'https://drslid.github.io/EvPortal/';
const frontendOnly = process.argv.includes('--frontend-only');
const additions = {
    justwatch: 'https://www.justwatch.com/fr',
    onf: 'https://www.onf.ca/',
    somafm: 'https://somafm.com/',
    'radio-paradise': 'https://radioparadise.com/',
    mynoise: 'https://mynoise.net/',
    'nasa-plus': 'https://plus.nasa.gov/',
    'electricity-maps': 'https://app.electricitymaps.com/',
    'little-alchemy-2': 'https://littlealchemy2.com/',
    'infinite-craft': 'https://neal.fun/infinite-craft/',
    wikivoyage: 'https://fr.wikivoyage.org/wiki/Accueil',
    'atlas-obscura': 'https://www.atlasobscura.com/',
    techmeme: 'https://www.techmeme.com/',
    'zoom-earth': 'https://zoom.earth/',
    lightningmaps: 'https://www.lightningmaps.org/',
    'fast-com': 'https://fast.com/'
};
const fixture = {
    version: 2, theme: 'dark', activeCategory: 'smoke-trip',
    categories: [
        { id: 'smoke-trip', label: 'Essai production', icon: 'charging', shortcuts: [
            { id: 'smoke-link', name: 'Essai QR EvPortal', url: 'https://example.org/evportal-smoke',
                description: 'Données synthétiques de recette', favorite: true, clickCount: 3,
                categoryIds: ['smoke-trip', 'smoke-tools'] }
        ] },
        { id: 'smoke-tools', label: 'Essai outils', icon: 'productivity', shortcuts: [] }
    ]
};
const pageErrors = [];
const relayRequests = [];
const privateValues = new Set();
let phase = 'browser startup';
let browser, car, relayURL, session, deletionVerified = false;

function check(condition, message) { assert.ok(condition, message); }
function safeFailure(error) {
    let message = String(error && error.message || error).split('\n')[0];
    for (const value of privateValues) if (value) message = message.split(value).join('[redacted]');
    return message.replace(/#receive=[^\s"'<>]+/g, '#receive=[redacted]')
        .replace(/Bearer\s+[^\s"'<>]+/gi, 'Bearer [redacted]')
        .replace(/\b[a-f0-9]{32,}\b/gi, '[redacted]');
}
function sessionURL() { return relayURL + '/v1/sessions/' + session.id; }
function matchesResponse(response, method, url) {
    return response.request().method() === method && response.url() === url;
}

(async () => {
    check(process.argv.slice(2).every(argument => argument === '--frontend-only'), 'Only --frontend-only is accepted');
    browser = await chromium.launch({ headless: true, channel: 'chromium' });
    car = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr-FR', reducedMotion: 'reduce' });
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR', isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    for (const context of [car, phone]) {
        context.on('page', page => page.on('pageerror', error => pageErrors.push(error.message)));
        context.on('request', request => {
            const url = new URL(request.url());
            if (url.hostname === 'api.telegra.ph') pageErrors.push('Unexpected Telegra.ph request');
            if (relayURL && url.origin === new URL(relayURL).origin) {
                relayRequests.push({ method: request.method(), body: request.postData() });
            }
        });
    }
    const receiver = await car.newPage();
    receiver.setDefaultTimeout(20000);
    phase = 'deployed catalogue and configuration';
    const response = await receiver.goto(PORTAL, { waitUntil: 'networkidle', timeout: 45000 });
    check(response && response.ok(), 'Production portal did not load successfully');
    check(receiver.url() === PORTAL, 'Unexpected portal destination');
    const deployed = await receiver.evaluate(() => ({
        relay: window.EV_CONFIG && EV_CONFIG.pairingRelayURL,
        catalogue: window.EV_CATALOG && EV_CATALOG.categories.flatMap(category => category.shortcuts).map(shortcut => ({ id: shortcut.serviceId, url: shortcut.url })),
        hasPreferences: Boolean(window.EVPreferences && typeof EVPreferences.createPreferences === 'function'),
        hasPairing: Boolean(window.EVPairing && typeof EVPairing.parseFragment === 'function')
    }));
    let relayConfigured = false;
    try {
        const parsedRelay = new URL(deployed.relay);
        relayConfigured = parsedRelay.protocol === 'https:' && !parsedRelay.username && !parsedRelay.password && !parsedRelay.search && !parsedRelay.hash;
    } catch (_) { /* A frontend-only deployment may deliberately omit the relay. */ }
    if (!frontendOnly) check(relayConfigured, 'Production QR is not activated: a real public HTTPS relay address is required');
    if (relayConfigured) relayURL = deployed.relay.replace(/\/$/, '');
    check(deployed.hasPreferences && deployed.hasPairing, 'Production preferences or pairing module is missing');
    for (const [id, url] of Object.entries(additions)) {
        check(deployed.catalogue.filter(item => item.id === id && item.url === url).length === 1, 'Missing or duplicated catalogue addition: ' + id);
    }
    await receiver.locator('#settingsButton').click();
    await receiver.locator('#catalogPreferences summary').click();
    check(await receiver.locator('#marketSelect').inputValue() === 'FR', 'French context must suggest France');
    check(await receiver.locator('#homeFavoritesToggle').isVisible(), 'Favorites home preference is missing');
    check(await receiver.locator('#categoryVisibilityOptions input').count() > 0, 'Category visibility preferences are missing');
    check(await receiver.locator('#backupSettings #shareButton').isVisible(), 'Export backup action is missing from settings');
    check(await receiver.locator('#backupSettings #importConfigButton').isVisible(), 'Import backup action is missing from settings');
    check(await receiver.locator('#pairReceiveButton').isVisible() === relayConfigured, 'QR action visibility does not match production relay availability');
    if (frontendOnly) {
        phase = 'frontend backup interface';
        await receiver.locator('#shareButton').click();
        await receiver.locator('#shareDialog').waitFor({ state: 'visible' });
        check(await receiver.locator('#sharePublishButton').isVisible(), 'Backup publication interface is missing');
        await receiver.locator('#fileExportOptions summary').click();
        check(await receiver.locator('#exportConfigButton').isVisible(), 'JSON export interface is missing');
        await receiver.locator('#shareDialog [data-close-dialog]').first().click();
        await receiver.locator('#settingsButton').click();
        await receiver.locator('#importConfigButton').click();
        await receiver.locator('#importDialog').waitFor({ state: 'visible' });
        await receiver.locator('#legacyImportOptions summary').click();
        check(await receiver.locator('#importConfigID').isVisible(), 'Backup code and link import interface is missing');
        check(await receiver.locator('#importFile').count() === 1, 'JSON file import interface is missing');
        check(!relayRequests.some(request => ['POST', 'PUT', 'DELETE'].includes(request.method)), 'Frontend-only check must not create or transfer a session');
        check(pageErrors.length === 0, 'Frontend raised a JavaScript error or unexpected publication request');
        console.log('✓ Production frontend: all 15 additions, preferences and export/import interfaces are present');
        console.log(relayConfigured ? 'QR activé dans la configuration ; transfert non testé (--frontend-only).' : 'QR non activé : bouton masqué, aucun transfert tenté.');
        return;
    }
    const original = await receiver.evaluate(() => localStorage.getItem(EVState.STORAGE_KEY));
    const originalPreferences = await receiver.evaluate(() => JSON.stringify(EVPreferences.createPreferences().read()));
    console.log('✓ Deployed portal: all 15 additions, preferences and a real HTTPS relay configuration are present');

    phase = 'real session creation and QR decoding';
    const createdPromise = receiver.waitForResponse(result => matchesResponse(result, 'POST', relayURL + '/v1/sessions'));
    await receiver.locator('#pairReceiveButton').click();
    const createdResponse = await createdPromise;
    check(createdResponse.ok(), 'Production relay refused session creation');
    session = await createdResponse.json();
    check(/^[a-f0-9]{32}$/.test(session.id) && /^[a-f0-9]{64}$/.test(session.receiveToken) && /^[a-f0-9]{64}$/.test(session.sendToken), 'Relay returned invalid session credentials');
    for (const value of [session.id, session.receiveToken, session.sendToken]) privateValues.add(value);
    check(Number.isSafeInteger(session.expiresAt) && session.expiresAt > Date.now() && session.expiresAt <= Date.now() + 300000, 'Relay session expiration is invalid');
    await receiver.locator('#pairReceiveQRCode').waitFor({ state: 'visible' });
    const pixels = await receiver.locator('#pairReceiveQRCode canvas').evaluate(canvas => ({
        width: canvas.width, height: canvas.height,
        data: Array.from(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data)
    }));
    const decoded = jsQR(Uint8ClampedArray.from(pixels.data), pixels.width, pixels.height);
    check(decoded && typeof decoded.data === 'string', 'Production QR could not be decoded');
    privateValues.add(decoded.data);
    const qrURL = new URL(decoded.data);
    check(qrURL.origin === new URL(PORTAL).origin && qrURL.pathname === new URL(PORTAL).pathname && !qrURL.search && qrURL.hash.startsWith('#receive='), 'QR points outside the deployed portal');
    const credentials = await receiver.evaluate(hash => EVPairing.parseFragment(hash), qrURL.hash);
    privateValues.add(credentials.key);
    check(credentials.id === session.id && credentials.token === session.sendToken && credentials.receiveToken === undefined, 'QR credentials do not match the real receiving session');
    check(!decoded.data.includes(session.receiveToken), 'QR must not expose receiving credentials');

    phase = 'phone scan and explicit sending';
    const sender = await phone.newPage();
    sender.setDefaultTimeout(20000);
    await sender.goto(PORTAL, { waitUntil: 'networkidle', timeout: 45000 });
    const expected = await sender.evaluate(initial => {
        const state = EVState.normalizeState(initial);
        localStorage.setItem(EVState.STORAGE_KEY, JSON.stringify(state));
        EVPreferences.createPreferences().patch({ market: 'CA', homeFavorites: true });
        return state;
    }, fixture);
    await sender.reload({ waitUntil: 'networkidle' });
    // Follow the exact decoded URL, including same-document hash navigation.
    await sender.goto(decoded.data, { waitUntil: 'networkidle' });
    await sender.locator('#pairSendDialog').waitFor({ state: 'visible' });
    check(new URL(sender.url()).hash === '', 'Sender credentials must be removed from the address bar');
    check(!relayRequests.some(request => request.method === 'PUT'), 'Scanning alone must not upload the configuration');
    const expectedSummary = await sender.evaluate(() => EVI18n.t('pair.summary', { categories: 2, count: 1 }));
    check(await sender.locator('#pairSendSummary').textContent() === expectedSummary, 'Phone preview must describe the synthetic configuration');
    const deletedPromise = receiver.waitForResponse(result => matchesResponse(result, 'DELETE', sessionURL()), { timeout: 30000 });
    deletedPromise.catch(() => {});
    await sender.locator('#pairSendButton').click();
    await sender.locator('#pairSendStatus[data-i18n="pair.sent"]').waitFor({ state: 'visible' });
    const upload = relayRequests.find(request => request.method === 'PUT');
    check(upload && typeof upload.body === 'string', 'Phone did not upload to the configured relay');
    const payload = JSON.parse(upload.body);
    check(Object.keys(payload).sort().join(',') === 'ciphertext,iv', 'Relay upload must contain only encrypted payload fields');
    check(!upload.body.includes('Essai QR') && !upload.body.includes(credentials.key), 'Relay upload must not disclose plaintext or its encryption key');

    phase = 'Tesla preview, explicit application and relay deletion';
    await receiver.locator('#pairApplyButton').waitFor({ state: 'visible', timeout: 30000 });
    check(await receiver.locator('#pairReceiveQRCode').isHidden(), 'Consumed QR must disappear');
    check(await receiver.evaluate(() => localStorage.getItem(EVState.STORAGE_KEY)) === original, 'Receiving must preview before replacing the Tesla configuration');
    const deletedResponse = await deletedPromise;
    check(deletedResponse.status() === 204, 'Relay did not acknowledge deletion of the consumed session');
    const removed = await car.request.get(sessionURL(), { headers: { Authorization: 'Bearer ' + session.receiveToken, Origin: new URL(PORTAL).origin }, timeout: 15000 });
    check(removed.status() === 410, 'Consumed relay session remains retrievable');
    deletionVerified = true;
    await receiver.locator('#pairApplyButton').click();
    await receiver.locator('#pairReceiveDialog').waitFor({ state: 'hidden' });
    const applied = await receiver.evaluate(() => JSON.parse(localStorage.getItem(EVState.STORAGE_KEY)));
    // The sender's device preference opens Favorites before sharing; the portable
    // active view is therefore allowed to differ from the original fixture.
    check(applied.categories.length === expected.categories.length, 'Applied category count is wrong');
    assert.deepEqual(applied.categories, expected.categories, 'Applied synthetic categories differ from the phone configuration');
    assert.deepEqual(applied.shortcutOrder, expected.shortcutOrder, 'Shared shortcut order changed');
    check(await receiver.evaluate(() => JSON.stringify(EVPreferences.createPreferences().read())) === originalPreferences, 'Phone preferences must not replace Tesla device preferences');
    await receiver.reload({ waitUntil: 'networkidle' });
    const persisted = await receiver.evaluate(() => JSON.parse(localStorage.getItem(EVState.STORAGE_KEY)));
    assert.deepEqual(persisted.categories, expected.categories, 'Applied configuration did not survive a reload');
    check(pageErrors.length === 0, 'A production page raised a JavaScript error or unexpected publication request');
    console.log('✓ Unmodified production QR: isolated phone sends ciphertext; Tesla previews, applies and persists the synthetic state; relay deletion confirmed');
})().catch(error => {
    console.error('Production check failed during ' + phase + ': ' + safeFailure(error));
    process.exitCode = 1;
}).finally(async () => {
    if (session && relayURL && car && !deletionVerified) {
        try {
            const response = await car.request.delete(sessionURL(), { headers: { Authorization: 'Bearer ' + session.receiveToken, Origin: new URL(PORTAL).origin }, timeout: 10000 });
            if (![204, 410].includes(response.status())) console.error('Test session cleanup was not acknowledged; its five-minute expiry still applies.');
        } catch (_) { console.error('Test session cleanup could not be confirmed; its five-minute expiry still applies.'); }
    }
    if (browser) await browser.close();
});
