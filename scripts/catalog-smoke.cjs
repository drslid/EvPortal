/* Canonical catalogue services exercised through the actual browser interface. */
'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
const server = http.createServer(async (request, response) => {
    try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        const relative = pathname.replace(/^\/EvPortal\//, '').replace(/^\//, '') || 'index.html';
        const filename = path.resolve(root, relative);
        if (!filename.startsWith(root + path.sep)) throw new Error('Invalid path');
        const bytes = await fs.readFile(filename);
        response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream' });
        response.end(bytes);
    } catch (_) { response.writeHead(404); response.end('Not found'); }
});

const entries = state => state.categories.flatMap(category => category.shortcuts.map(shortcut => ({ category, shortcut })));
const entry = (state, id) => entries(state).find(row => row.shortcut.id === id);
const service = (state, id) => entries(state).find(row => row.shortcut.serviceId === id);
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem(EVState.STORAGE_KEY)));
const card = (page, id) => page.locator('#content > .shortcut[data-shortcut-id="' + id + '"]');
const category = (page, id) => page.locator('#menu [data-category="' + id + '"]').click();
const close = (page, id) => page.locator('#' + id + ' [data-close-dialog]').first().click();
const additional = (page, id) => page.locator('#shortcutAdditionalCategories input[value="' + id + '"]');
const errors = [];
const nativeDialogs = [];
const unexpectedRequests = [];
let browser;

(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const portal = origin + '/EvPortal/';
    browser = await chromium.launch({ headless: true, channel: 'chromium' });
    const contexts = [];

    async function freshPage(fixture) {
        const context = await browser.newContext({ locale: 'fr-FR', viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
        contexts.push(context);
        await context.route('**/*', route => {
            const request = route.request();
            const url = new URL(request.url());
            if (url.origin === origin) return route.continue();
            if (url.hostname === 'abetterrouteplanner.com' && request.method() === 'GET' && request.isNavigationRequest()) {
                return route.fulfill({ contentType: 'text/html', body: '<title>ABRP fixture</title>Test destination' });
            }
            unexpectedRequests.push(request.method() + ' ' + request.url());
            return route.abort();
        });
        const page = await context.newPage();
        page.setDefaultTimeout(6000);
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', async dialog => { nativeDialogs.push(dialog.message()); await dialog.dismiss(); });
        await page.goto(portal, { waitUntil: 'networkidle' });
        if (fixture) {
            await page.evaluate(state => localStorage.setItem(EVState.STORAGE_KEY, JSON.stringify(state)), fixture);
            await page.reload({ waitUntil: 'networkidle' });
        }
        return page;
    }

    async function edit(page, id) {
        await card(page, id).locator('.shortcut-actions button[aria-label^="Modifier"]').click();
        await page.locator('#shortcutDialog').waitFor({ state: 'visible' });
    }
    async function submit(page) {
        await page.locator('#addShortcutForm [type="submit"]').click();
        await page.locator('#shortcutDialog').waitFor({ state: 'hidden' });
    }
    async function openShortcut(page, id) {
        const popupPromise = page.context().waitForEvent('page');
        await card(page, id).locator('.shortcut-link').click();
        const popup = await popupPromise;
        await popup.bringToFront();
        await popup.waitForURL('https://abetterrouteplanner.com/');
        await popup.waitForLoadState('domcontentloaded');
        assert.equal(await popup.evaluate(() => window.opener), null);
        assert.equal(page.url(), portal);
        await popup.close();
        await page.bringToFront();
    }

    const page = await freshPage();
    const initial = await saved(page);
    assert.equal(await page.evaluate(() => EVPreferences.createPreferences().read().market), 'FR');
    const abrp = service(initial, 'abrp').shortcut;
    const id = abrp.id;
    assert.equal(entries(initial).filter(row => row.shortcut.serviceId === 'abrp').length, 1);
    assert.deepEqual(abrp.categoryIds, ['charging', 'navigation']);
    await category(page, 'charging');
    assert.equal(await card(page, id).count(), 1);
    await page.locator('#editModeToggle').click();
    await card(page, id).locator('.favorite-toggle').click();
    await page.locator('#editModeToggle').click();
    await category(page, 'navigation');
    assert.equal(await card(page, id).count(), 1);
    assert.equal(await card(page, id).locator('.favorite-toggle').getAttribute('aria-pressed'), 'true');
    assert.equal(entry(await saved(page), id).shortcut.clickCount, 0);
    const link = card(page, id).locator('.shortcut-link');
    assert.equal(await link.getAttribute('target'), '_blank');
    assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
    await openShortcut(page, id);
    assert.equal(entry(await saved(page), id).shortcut.clickCount, 1);
    await category(page, 'all');
    assert.equal(await card(page, id).count(), 1);
    assert.equal(await page.locator('#content > .shortcut').first().getAttribute('data-shortcut-id'), id);
    await category(page, 'favorites');
    assert.equal(await card(page, id).count(), 1);
    console.log('✓ Fresh French catalogue shares one ABRP across categories, favorites and one persisted click; Tous ranks it once');

    await page.locator('#editModeToggle').click();
    await category(page, 'charging');
    await edit(page, id);
    await page.locator('#shortcutName').fill('Mon trajet électrique');
    // Description is deliberately hidden in the minimal car UI. Exercise its
    // existing form value without exposing an extra control to the user.
    await page.locator('#shortcutDescription').evaluate(input => { input.value = 'Mes étapes et bornes préférées'; });
    await submit(page);
    for (const categoryID of ['charging', 'navigation']) {
        await category(page, categoryID);
        assert.equal(await card(page, id).locator('.shortcut-name').textContent(), 'Mon trajet électrique');
        await edit(page, id);
        assert.equal(await page.locator('#shortcutDescription').inputValue(), 'Mes étapes et bornes préférées');
        assert.equal(await page.locator('#shortcutCategory').inputValue(), 'charging');
        await close(page, 'shortcutDialog');
    }
    await edit(page, id);
    await page.locator('#shortcutCategory').selectOption('navigation');
    assert.equal(await additional(page, 'charging').isChecked(), true);
    await page.locator('#shortcutCategory').selectOption('charging');
    assert.equal(await additional(page, 'navigation').isChecked(), true);
    await submit(page);
    assert.deepEqual(entry(await saved(page), id).shortcut.categoryIds, ['charging', 'navigation']);
    console.log('✓ Editing either category changes the same name and description; switching primary category away and back retains memberships');

    await edit(page, id);
    await additional(page, 'music').check();
    await additional(page, 'weather').check();
    await submit(page);
    assert.deepEqual(new Set(entry(await saved(page), id).shortcut.categoryIds), new Set(['charging', 'navigation', 'music', 'weather']));
    for (const categoryID of ['music', 'weather']) {
        await category(page, categoryID);
        assert.equal(await card(page, id).locator('.shortcut-name').textContent(), 'Mon trajet électrique');
        assert.equal(await card(page, id).locator('.favorite-toggle').getAttribute('aria-pressed'), 'true');
    }
    await edit(page, id);
    await additional(page, 'music').uncheck();
    await additional(page, 'weather').uncheck();
    await submit(page);
    assert.deepEqual(entry(await saved(page), id).shortcut.categoryIds, ['charging', 'navigation']);
    const beforeDeletion = await saved(page);
    const exclusiveChargingIDs = entries(beforeDeletion).filter(row => row.shortcut.categoryIds.length === 1 && row.shortcut.categoryIds[0] === 'charging').map(row => row.shortcut.id);
    assert.ok(exclusiveChargingIDs.length > 0);
    await category(page, 'charging');
    await page.getByRole('button', { name: 'Supprimer la catégorie Recharge', exact: true }).click();
    const rehomed = await saved(page);
    assert.equal(rehomed.categories.some(item => item.id === 'charging'), false);
    assert.equal(entry(rehomed, id).category.id, 'navigation');
    assert.deepEqual(entry(rehomed, id).shortcut.categoryIds, ['navigation']);
    assert.equal(entry(rehomed, id).shortcut.favorite, true);
    assert.equal(entry(rehomed, id).shortcut.clickCount, 1);
    assert.equal(entries(rehomed).filter(row => row.shortcut.id === id).length, 1);
    assert.ok(exclusiveChargingIDs.every(exclusiveID => !entry(rehomed, exclusiveID)));
    await category(page, 'navigation');
    assert.equal(await card(page, id).count(), 1);
    console.log('✓ Arbitrary additional categories can be added and removed; deleting Recharge rehomes ABRP in Navigation and removes exclusive shortcuts');

    const portable = await page.evaluate(async () => {
        const state = JSON.parse(localStorage.getItem(EVState.STORAGE_KEY));
        const backup = EVTelegraph.contentForState(state);
        const fromBackup = EVState.parseImport(JSON.parse(backup)[0].children[0], EV_CATALOG);
        const key = EVPairing.createKey();
        const session = '1234567890abcdef1234567890abcdef';
        const payload = await EVPairing.encryptState(state, key, session);
        const fromQR = await EVPairing.decryptState(payload, key, session);
        return { state, fromBackup, fromQR };
    });
    assert.deepEqual(portable.fromBackup, portable.state);
    assert.deepEqual(portable.fromQR, portable.state);
    for (const state of [portable.fromBackup, portable.fromQR]) {
        assert.equal(entries(state).filter(row => row.shortcut.id === id).length, 1);
        assert.deepEqual(entry(state, id).shortcut.categoryIds, ['navigation']);
        assert.equal(entry(state, id).shortcut.description, 'Mes étapes et bornes préférées');
        for (const serviceID of ['canal-plus', 'pluto-tv']) {
            assert.equal(entries(state).filter(row => row.shortcut.serviceId === serviceID).length, 1);
            assert.deepEqual(service(state, serviceID).shortcut.categoryIds, ['cinema', 'tv']);
        }
    }
    console.log('✓ Telegra.ph serialization and the encrypted QR transfer round-trip preserve one copy, memberships and personalized fields');

    await edit(page, id);
    await page.locator('#shortcutURL').fill('https://personal-route.example/');
    await submit(page);
    const personal = entry(await saved(page), id).shortcut;
    assert.equal(personal.serviceId, undefined);
    assert.equal(personal.name, 'Mon trajet électrique');
    assert.equal(personal.clickCount, 1);
    await page.locator('#catalogButton').click();
    await page.locator('#catalogSearch').fill('ABRP');
    const addOfficial = page.locator('#catalogContent [data-service-id="abrp"] .catalog-add');
    assert.equal(await addOfficial.isEnabled(), true);
    await addOfficial.click();
    assert.equal(await addOfficial.isDisabled(), true);
    await close(page, 'catalogDialog');
    const withOfficial = await saved(page);
    const official = service(withOfficial, 'abrp').shortcut;
    assert.notEqual(official.id, id);
    assert.equal(official.url, 'https://abetterrouteplanner.com/');
    assert.deepEqual(official.categoryIds, ['charging', 'navigation']);
    assert.equal(entries(withOfficial).filter(row => row.shortcut.serviceId === 'abrp').length, 1);
    assert.equal(entry(withOfficial, id).shortcut.name, 'Mon trajet électrique');
    assert.equal(entry(withOfficial, id).shortcut.url, 'https://personal-route.example/');
    await page.reload({ waitUntil: 'networkidle' });
    assert.deepEqual(entry(await saved(page), id).shortcut, entry(withOfficial, id).shortcut);
    await category(page, 'all');
    assert.equal(await card(page, official.id).count(), 1);
    assert.equal(await card(page, id).count(), 1);
    console.log('✓ Changing the URL detaches catalogue identity; adding official ABRP again preserves the personalized shortcut and reload state');

    const historic = await freshPage({
        version: 2, activeCategory: 'all', theme: 'dark',
        categories: [{ id: 'personal', label: 'Mes trajets', shortcuts: [
            { id: 'custom-a', name: 'Trajet maison', url: 'https://abetterrouteplanner.com/', favorite: true, clickCount: 7 },
            { id: 'custom-b', name: 'Trajet travail', url: 'https://abetterrouteplanner.com/', clickCount: 3 }
        ] }]
    });
    assert.equal(entries(await saved(historic)).length, 2);
    assert.ok(entries(await saved(historic)).every(row => row.shortcut.serviceId === undefined));
    await historic.locator('#editModeToggle').click();
    await edit(historic, 'custom-a');
    await historic.locator('#shortcutName').fill('Maison renommée');
    await submit(historic);
    const historicSaved = await saved(historic);
    assert.equal(entry(historicSaved, 'custom-a').shortcut.name, 'Maison renommée');
    assert.equal(entry(historicSaved, 'custom-a').shortcut.clickCount, 7);
    assert.equal(entry(historicSaved, 'custom-b').shortcut.name, 'Trajet travail');
    assert.equal(entries(historicSaved).length, 2);
    await historic.reload({ waitUntil: 'networkidle' });
    assert.equal(entry(await saved(historic), 'custom-a').shortcut.name, 'Maison renommée');
    assert.equal(entries(await saved(historic)).length, 2);
    console.log('✓ Historical personal shortcuts sharing a URL remain separate and can be renamed without a duplicate-URL error');

    const creation = await freshPage();
    await category(creation, 'all');
    await creation.locator('#settingsButton').click();
    await creation.locator('#addShortcutButton').click();
    assert.equal(await creation.locator('#shortcutCategory').inputValue(), 'cinema');
    await creation.locator('#shortcutName').fill('Borne personnelle');
    await creation.locator('#shortcutURL').fill('https://borne-personnelle.example/');
    await creation.locator('#shortcutCategory').selectOption('navigation');
    await creation.locator('#shortcutCategory').selectOption('charging');
    assert.equal(await additional(creation, 'cinema').isChecked(), false);
    assert.equal(await additional(creation, 'navigation').isChecked(), false);
    await submit(creation);
    const created = entries(await saved(creation)).find(row => row.shortcut.name === 'Borne personnelle');
    assert.equal(created.category.id, 'charging');
    assert.deepEqual(created.shortcut.categoryIds, ['charging']);
    await category(creation, 'all');
    await creation.locator('#settingsButton').click();
    await creation.locator('#addShortcutButton').click();
    await creation.locator('#shortcutName').fill('Borne et météo');
    await creation.locator('#shortcutURL').fill('https://borne-meteo.example/');
    await creation.locator('#shortcutCategory').selectOption('charging');
    await creation.locator('#shortcutAdditionalOptions > summary').click();
    await additional(creation, 'weather').check();
    await creation.locator('#shortcutCategory').selectOption('weather');
    await creation.locator('#shortcutCategory').selectOption('charging');
    assert.equal(await additional(creation, 'weather').isChecked(), true);
    assert.equal(await additional(creation, 'cinema').isChecked(), false);
    await submit(creation);
    const explicitlyShared = entries(await saved(creation)).find(row => row.shortcut.name === 'Borne et météo');
    assert.deepEqual(explicitlyShared.shortcut.categoryIds, ['charging', 'weather']);
    console.log('✓ New shortcuts use only the chosen primary category and explicitly checked secondary categories');

    const oldBackup = {
        version: 2, activeCategory: 'all', theme: 'dark', categories: [
            { id: 'cinema', label: 'Cinéma & vidéo', shortcuts: [
                { id: 'old-canal-cinema', name: 'CANAL+', url: 'https://www.canalplus.com/', clickCount: 2 },
                { id: 'old-pluto-cinema', name: 'Pluto TV', url: 'https://pluto.tv/fr/', clickCount: 3 },
                { id: 'old-gulli', name: 'Gulli', url: 'https://www.m6.fr/gulli/direct' }
            ] },
            { id: 'tv', label: 'Télévision', shortcuts: [
                { id: 'old-canal-tv', name: 'CANAL+', url: 'https://www.canalplus.com/', clickCount: 3, favorite: true },
                { id: 'old-pluto-tv', name: 'Pluto TV', url: 'https://pluto.tv/fr/watch/live-tv/', clickCount: 1 }
            ] },
            { id: 'charging', label: 'Recharge', shortcuts: [
                { id: 'old-abrp-charging', name: 'ABRP', url: 'https://abetterrouteplanner.com/', description: 'Mes étapes sauvegardées', clickCount: 4, favorite: true }
            ] },
            { id: 'navigation', label: 'Navigation', shortcuts: [
                { id: 'old-abrp-navigation', name: 'ABRP', url: 'https://abetterrouteplanner.com/', clickCount: 5 }
            ] },
            { id: 'personal', label: 'Mes trajets', shortcuts: [
                { id: 'old-custom', name: 'Mon trajet privé', url: 'https://abetterrouteplanner.com/', clickCount: 7 }
            ] }
        ]
    };
    function assertMigratedBackup(state) {
        assert.equal(entries(state).length, 5);
        for (const serviceID of ['abrp', 'canal-plus', 'pluto-tv', 'gulli']) assert.equal(entries(state).filter(row => row.shortcut.serviceId === serviceID).length, 1);
        assert.equal(service(state, 'abrp').shortcut.clickCount, 9);
        assert.equal(service(state, 'abrp').shortcut.favorite, true);
        assert.equal(service(state, 'abrp').shortcut.description, 'Mes étapes sauvegardées');
        assert.deepEqual(service(state, 'abrp').shortcut.categoryIds, ['charging', 'navigation']);
        assert.equal(service(state, 'canal-plus').shortcut.clickCount, 5);
        assert.equal(service(state, 'canal-plus').shortcut.favorite, true);
        assert.equal(service(state, 'pluto-tv').shortcut.clickCount, 4);
        assert.equal(service(state, 'gulli').category.id, 'tv');
        assert.deepEqual(service(state, 'gulli').shortcut.categoryIds, ['tv']);
        assert.equal(entry(state, 'old-custom').shortcut.name, 'Mon trajet privé');
        assert.equal(entry(state, 'old-custom').shortcut.serviceId, undefined);
        assert.equal(entry(state, 'old-custom').shortcut.clickCount, 7);
    }
    const synced = await freshPage();
    const writer = await synced.context().newPage();
    writer.on('pageerror', error => errors.push(error.message));
    await writer.goto(portal, { waitUntil: 'networkidle' });
    await writer.evaluate(state => localStorage.setItem(EVState.STORAGE_KEY, JSON.stringify(state)), oldBackup);
    await synced.waitForFunction(() => document.querySelectorAll('#content > .shortcut').length === 5);
    assert.equal(await synced.locator('#content .shortcut-name').filter({ hasText: /^ABRP$/ }).count(), 1);
    assert.equal(await card(synced, 'old-gulli').getAttribute('data-category-id'), 'tv');
    await category(synced, 'navigation');
    assert.equal(await card(synced, 'old-abrp-charging').count(), 1);
    assertMigratedBackup(await saved(synced));
    await writer.close();
    console.log('✓ A real storage event from an older tab migrates shared services before displaying them and preserves personal fields');

    const undo = await freshPage();
    await undo.evaluate(state => localStorage.setItem('evportal.previous-transfer.v1', JSON.stringify(state)), oldBackup);
    await undo.reload({ waitUntil: 'networkidle' });
    await undo.locator('#settingsButton').click();
    await undo.locator('#undoTransferButton').evaluate(button => { button.closest('details').open = true; });
    await undo.locator('#undoTransferButton').click();
    assert.equal(await undo.locator('#settingsDialog').isVisible(), false);
    assert.equal(await undo.locator('#content > .shortcut').count(), 5);
    assertMigratedBackup(await saved(undo));
    assert.equal(await undo.evaluate(() => localStorage.getItem('evportal.previous-transfer.v1')), null);
    await undo.reload({ waitUntil: 'networkidle' });
    assertMigratedBackup(await saved(undo));
    console.log('✓ Undo migrates a recovery copy from an earlier version before restoring it, with combined counts and one canonical service');

    assert.deepEqual(nativeDialogs, []);
    assert.deepEqual(unexpectedRequests, []);
    assert.deepEqual(errors, []);
    await Promise.all(contexts.map(context => context.close()));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
});
