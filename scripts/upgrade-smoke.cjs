/* End-to-end checks against npm run dev, including its real local encrypted-sync handler. */
'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const target = new URL(process.env.EVPORTAL_TEST_URL || 'http://127.0.0.1:4187/');
assert.ok(target.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname), 'Only run upgrade checks against a local development server');
const fixture = label => ({
    version: 2, activeCategory: 'all', theme: 'dark', categories: [
        { id: 'personal', label: 'Mes liens', icon: 'folder', shortcuts: [
            { id: 'custom-' + label, name: 'Lien personnel ' + label, url: 'https://example.org/' + label, favorite: true }
        ] },
        { id: 'tv', label: 'Télévision', icon: 'tv', shortcuts: [
            { id: 'favorite-molotov', serviceId: 'molotov', name: 'Molotov', url: 'https://www.molotov.tv/', favorite: true }
        ] }
    ]
});
const pageErrors = [];
const unexpectedRequests = [];
const contexts = [];
let browser;
let first;
let recoveryCode;

function check(message) { console.log('✓ ' + message); }
async function readState(page) { return page.evaluate(() => EVState.normalizeState(JSON.parse(localStorage.getItem(EVState.STORAGE_KEY)))); }
function facts(state) { return { categories: state.categories, shortcutOrder: state.shortcutOrder }; }
async function backups(page) {
    return page.evaluate(async () => {
        const database = EVStorage.createDatabase();
        try { return (await database.read(EVBackups.STORAGE_KEY)).backups; }
        finally { database.close(); }
    });
}
async function ready(page) {
    await page.locator('html[data-evportal-ready="true"]').waitFor({ state: 'visible' });
    await page.waitForFunction(() => EVI18n.t('upgrade.adapt') !== 'upgrade.adapt');
    assert.equal(await page.locator('.local-preview').count(), 1, 'The test requires the local-preview configuration');
}
async function pageFor(options = {}) {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'fr-FR', reducedMotion: 'reduce', ...options.context });
    contexts.push(context);
    await context.route('**/*', route => {
        const requestURL = new URL(route.request().url());
        if (requestURL.origin === target.origin || (requestURL.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(requestURL.hostname))) return route.continue();
        if (requestURL.hostname === 'api.telegra.ph') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, result: { pages: [], total_count: 0 } }) });
        unexpectedRequests.push(requestURL.origin + requestURL.pathname);
        return route.abort();
    });
    if (options.fixture) await context.addInitScript(value => {
        if (!localStorage.getItem('evportal.state.v2')) localStorage.setItem('evportal.state.v2', JSON.stringify(value));
    }, options.fixture);
    const page = await context.newPage();
    page.on('pageerror', issue => pageErrors.push(issue.message));
    await page.goto(target.href, { waitUntil: 'networkidle' });
    await ready(page);
    return page;
}
async function closeSettings(page) {
    if (await page.locator('#settingsDialog').evaluate(node => node.open)) await page.locator('#settingsDialog .dialog-heading [data-close-dialog]').click();
}
async function settings(page, section) {
    if (!await page.locator('#settingsDialog').evaluate(node => node.open)) await page.locator('#settingsButton').click();
    if (section && !await page.locator('#' + section).evaluate(node => node.open)) await page.locator('#' + section + ' > summary').click();
}
async function addShortcut(page, name) {
    await closeSettings(page);
    await page.locator('#catalogButton').click();
    await page.locator('#catalogCustomButton').click();
    await page.locator('#shortcutName').fill(name);
    await page.locator('#shortcutURL').fill('https://example.org/' + encodeURIComponent(name));
    await page.locator('#shortcutCategory').selectOption('personal');
    await page.locator('#addShortcutForm [type="submit"]').click();
    await page.locator('#shortcutDialog').waitFor({ state: 'hidden' });
    await page.waitForFunction(name => EVState.allShortcutEntries(JSON.parse(localStorage.getItem(EVState.STORAGE_KEY))).some(entry => entry.shortcut.name === name), name);
}
async function waitSync(page, expectedKey) {
    await page.waitForFunction(key => document.getElementById('syncStatusMessage').textContent === EVI18n.t(key), expectedKey);
}
async function previewSync(page) {
    await page.waitForFunction(() => !document.getElementById('syncRemotePreview').hidden || document.getElementById('syncStatusMessage').classList.contains('is-error'));
    assert.equal(await page.locator('#syncStatusMessage').evaluate(node => node.classList.contains('is-error')), false,
        'The sync preview failed: ' + await page.locator('#syncStatusMessage').textContent());
    await page.locator('#syncRemotePreview').waitFor({ state: 'visible' });
}
async function noHorizontalOverflow(page, label) {
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    assert.ok(dimensions.page <= dimensions.viewport + 1 && dimensions.body <= dimensions.viewport + 1, label + ' has horizontal overflow: ' + JSON.stringify(dimensions));
}

(async () => {
    browser = await chromium.launch({ headless: true, channel: process.env.EVPORTAL_TEST_BROWSER_CHANNEL || 'msedge' });
    first = await pageFor({ fixture: fixture('voiture') });
    const initial = facts(await readState(first));
    assert.equal(await first.locator('#regionContext').count(), 0, 'Catalogue settings do not add a row to the dashboard');
    await settings(first, 'regionPreferences');
    assert.equal(await first.locator('#settingsDialog #adaptCatalogButton').count(), 1, 'Catalogue adaptation is available in settings');
    await first.locator('#catalogCountrySelect').selectOption('US');
    await first.locator('#contentLanguageOptions input[value="fr"]').check();
    await first.locator('#contentLanguageOptions input[value="de"]').check();
    assert.equal(await first.evaluate(() => EVI18n.language), 'fr');
    assert.deepEqual(await first.evaluate(() => JSON.parse(localStorage.getItem(EVRegions.STORAGE_KEY))), { version: 1, country: 'US', contentLanguages: ['fr', 'de'] });
    assert.deepEqual(facts(await readState(first)), initial);
    const declaredLanguage = await first.evaluate(() => EVI18n.pageLanguage);
    await first.locator('#languageSelect').selectOption('en');
    if (declaredLanguage) await first.waitForURL(/\/en\/?$/);
    else await first.waitForFunction(() => EVI18n.language === 'en');
    await ready(first);
    assert.equal(await first.evaluate(() => EVI18n.language), 'en');
    assert.deepEqual(await first.evaluate(() => JSON.parse(localStorage.getItem(EVRegions.STORAGE_KEY))), { version: 1, country: 'US', contentLanguages: ['fr', 'de'] });
    assert.deepEqual(facts(await readState(first)), initial);
    await closeSettings(first);
    await first.locator('[data-category="favorites"]').click();
    assert.equal(await first.locator('#content [data-shortcut-id="favorite-molotov"]').count(), 1, 'A saved French favorite remains accessible with country US');
    assert.equal(await first.locator('#content [data-shortcut-id="custom-voiture"]').count(), 1);
    check('Country, content languages and interface language remain independent; favorites and custom links survive');

    await settings(first);
    const beforeCopy = facts(await readState(first));
    await first.locator('#createLocalBackup').click();
    await first.waitForFunction(() => !document.getElementById('createLocalBackup').disabled);
    const copies = await backups(first);
    assert.equal(copies.length, 1);
    assert.deepEqual(facts(copies[0].state), beforeCopy);
    await addShortcut(first, 'Après la copie');
    assert.equal((await readState(first)).categories[0].shortcuts.some(item => item.name === 'Après la copie'), true);
    await settings(first);
    await first.locator('#restoreBackupButton').click();
    await first.locator('.backup-select[data-backup-key="' + copies[0].id + '"]').click();
    await first.locator('#confirmRestoreButton').click();
    await first.locator('#restoreDialog').waitFor({ state: 'hidden' });
    assert.deepEqual(facts(await readState(first)), beforeCopy);
    check('A local copy is committed to IndexedDB and restored through the visible backup picker');

    const syncRequests = [];
    first.on('request', request => { if (new URL(request.url()).pathname.startsWith('/sync-api/v1/')) syncRequests.push(request.method()); });
    await settings(first, 'deviceSyncPreferences');
    await first.locator('#rememberSyncConnection').check();
    await first.locator('#createSyncProfile').click();
    await waitSync(first, 'upgrade.saved');
    recoveryCode = await first.locator('#syncRecoveryCode').inputValue();
    assert.match(recoveryCode, /^EV1\.[A-Za-z0-9_-]{43}$/);
    assert.deepEqual(syncRequests, ['POST']);
    assert.equal(await first.evaluate(() => Boolean(localStorage.getItem(EVSync.STORAGE_KEY))), true);
    const profileState = facts(await readState(first));
    const second = await pageFor({ fixture: fixture('telephone') });
    const secondInitial = facts(await readState(second));
    await settings(second, 'deviceSyncPreferences');
    await second.locator('#syncRecoveryCode').fill(recoveryCode);
    await second.locator('#connectSyncProfile').click();
    await previewSync(second);
    assert.deepEqual(facts(await readState(second)), secondInitial, 'Connecting must not restore implicitly');
    assert.equal(await second.locator('#saveSyncProfile').isDisabled(), true, 'A pending remote version must be resolved before saving');
    await second.locator('#applySyncProfile').click();
    await waitSync(second, 'upgrade.applied');
    assert.deepEqual(facts(await readState(second)), profileState);
    const beforeRestoreCopies = await backups(second);
    assert.equal(beforeRestoreCopies.length, 1);
    assert.deepEqual(facts(beforeRestoreCopies[0].state), secondInitial, 'Restoring must first preserve the previous local configuration');
    assert.equal(await second.evaluate(() => localStorage.getItem(EVSync.STORAGE_KEY)), null);
    check('A second isolated device previews before restoring and saves its old configuration first');

    await addShortcut(second, 'Ajout téléphone');
    await settings(second, 'deviceSyncPreferences');
    await second.locator('#saveSyncProfile').click();
    await waitSync(second, 'upgrade.saved');
    await addShortcut(first, 'Ajout voiture');
    const localBeforeConflict = facts(await readState(first));
    await settings(first, 'deviceSyncPreferences');
    const conflict = first.waitForResponse(response => new URL(response.url()).pathname.startsWith('/sync-api/v1/profiles/') && response.request().method() === 'PUT');
    await first.locator('#saveSyncProfile').click();
    assert.equal((await conflict).status(), 409);
    await waitSync(first, 'upgrade.conflict');
    assert.deepEqual(facts(await readState(first)), localBeforeConflict);
    const remote = await first.evaluate(async code => {
        const reader = EVSync.createClient({ endpoint: EV_CONFIG.syncURL, storage: null });
        const latest = await reader.connect(code);
        return EVState.allShortcutEntries(latest.snapshot).map(entry => entry.shortcut.name);
    }, recoveryCode);
    assert.ok(remote.includes('Ajout téléphone'));
    assert.ok(!remote.includes('Ajout voiture'));
    await first.locator('#loadSyncProfile').click();
    await previewSync(first);
    assert.deepEqual(facts(await readState(first)), localBeforeConflict);
    await first.locator('#keepLocalSyncProfile').click();
    await first.locator('#syncRemotePreview').waitFor({ state: 'hidden' });
    assert.deepEqual(facts(await readState(first)), localBeforeConflict);
    check('Concurrent remote changes return a real conflict and overwrite neither local nor saved shortcuts');

    await first.reload({ waitUntil: 'networkidle' }); await ready(first);
    await settings(first, 'deviceSyncPreferences');
    assert.equal(await first.locator('#createSyncProfile').isVisible(), false);
    assert.equal(await first.locator('#rememberSyncConnection').isChecked(), true);
    assert.equal(await first.locator('#syncRecoveryCode').inputValue(), recoveryCode);
    await second.reload({ waitUntil: 'networkidle' }); await ready(second);
    await settings(second, 'deviceSyncPreferences');
    assert.equal(await second.locator('#createSyncProfile').isVisible(), true);
    assert.equal(await second.locator('#rememberSyncConnection').isChecked(), false);
    assert.equal(await second.locator('#syncRecoveryCode').inputValue(), '');
    check('The remembered device reconnects after reload; the unchecked device keeps no connection secret');

    const layout = await pageFor();
    const bounds = await layout.locator('#content > .shortcut').first().boundingBox();
    assert.equal(Math.round(bounds.width), 114);
    assert.equal(Math.round(bounds.height), 120);
    await noHorizontalOverflow(layout, 'Desktop');
    await layout.locator('#editModeToggle').click();
    assert.equal(await layout.locator('#editModeToggle').getAttribute('aria-pressed'), 'true');
    const favorite = layout.locator('#content > .shortcut').first().locator('.favorite-toggle');
    const oldFavorite = await favorite.getAttribute('aria-pressed');
    await favorite.click();
    assert.notEqual(await layout.locator('#content > .shortcut').first().locator('.favorite-toggle').getAttribute('aria-pressed'), oldFavorite);
    await noHorizontalOverflow(layout, 'Desktop edit mode');
    const mobile = await pageFor({ context: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } });
    await noHorizontalOverflow(mobile, 'Mobile');
    await mobile.locator('#editModeToggle').tap();
    await noHorizontalOverflow(mobile, 'Mobile edit mode');
    const firstCard = mobile.locator('#content > .shortcut').first();
    await firstCard.locator('.shortcut-actions .icon-button:not(.drag-handle):not(.danger)').tap();
    await mobile.locator('#shortcutDialog').waitFor({ state: 'visible' });
    await noHorizontalOverflow(mobile, 'Mobile shortcut editor');
    assert.equal(await mobile.locator('#shortcutName').isEditable(), true);
    check('Standard tiles measure 114 × 120 at 1600 px; desktop and mobile editing remain usable without horizontal overflow');

    assert.deepEqual(pageErrors, [], 'No browser exceptions');
    assert.deepEqual(unexpectedRequests, [], 'No unexpected external requests');
    console.log('Upgrade smoke checks passed. Screenshots and recovery codes are not written.');
})().catch(issue => { console.error(issue.stack || issue.message); process.exitCode = 1; }).finally(async () => {
    if (first && recoveryCode && !first.isClosed()) {
        try { await first.evaluate(async code => { const client = EVSync.createClient({ endpoint: EV_CONFIG.syncURL, storage: null }); await client.connect(code); await client.deleteProfile(); }, recoveryCode); }
        catch (_) { /* Preserve the original test failure if cleanup cannot reach the local service. */ }
    }
    for (const context of contexts) await context.close();
    if (browser) await browser.close();
});
