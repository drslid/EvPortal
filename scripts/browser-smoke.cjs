/* Integration checks on a local server; no real external service is called. */
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'test-results');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const server = http.createServer(async (req, res) => {
    try {
        const requestPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const relative = requestPath.replace(/^\/EvPortal\//, '').replace(/^\//, '') || 'index.html';
        const filename = path.resolve(root, relative);
        if (!filename.startsWith(root + path.sep)) throw new Error('Invalid path');
        const body = await fs.readFile(filename);
        res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream' });
        res.end(body);
    } catch (_) { res.writeHead(404); res.end('Not found'); }
});
let browser;
const errors = [];
const checks = [];
const check = (label) => { checks.push(label); console.log('✓ ' + label); };
const file = (data) => ({ name: 'configuration.json', mimeType: 'application/json', buffer: Buffer.from(typeof data === 'string' ? data : JSON.stringify(data)) });
(async () => {
    await fs.mkdir(output, { recursive: true });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const url = origin + '/EvPortal/';
    browser = await chromium.launch({ headless: true });
    async function context(options = {}) {
        const c = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'fr-FR', colorScheme: 'dark', reducedMotion: 'reduce', ...options });
        c.on('page', page => page.on('pageerror', error => errors.push(error.message)));
        await c.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        return c;
    }
    const c = await context();
    const page = await c.newPage();
    const requests = [];
    page.on('request', req => requests.push(req.url()));
    await page.goto(url, { waitUntil: 'networkidle' });
    const total = await page.evaluate(() => EVState.catalogServices(EV_CATALOG, { market: EVPreferences.suggestMarket(navigator.language), includeOptional: false }).length);
    assert.equal(Number(await page.locator('#shortcutTotal').textContent()), total);
    assert.equal(await page.locator('h1').count(), 1);
    assert.equal(requests.filter(req => new URL(req).origin !== origin).length, 0);
    assert.ok(await page.locator('.shortcut').count() > 0);
    check('Catalogue chargé sous /EvPortal/, un H1, aucune requête tierce au démarrage');

    await page.locator('#editModeToggle').click();
    await page.getByRole('button', { name: 'Ajouter Netflix aux favoris', exact: true }).click();
    await page.locator('[data-category="favorites"]').click();
    assert.equal(await page.locator('.shortcut').count(), 1);
    await page.reload();
    assert.match(await page.locator('#sectionTitle').textContent(), /favoris/i);
    assert.equal(await page.locator('.shortcut-name').textContent(), 'Netflix');
    await page.locator('#searchToggle').click();
    await page.locator('#searchInput').fill('meteo');
    assert.ok(await page.locator('.shortcut-name', { hasText: 'Météo-France' }).count());
    await page.locator('#searchInput').fill('zzzzaucunservice');
    assert.equal(await page.locator('.empty-state').count(), 1);
    await page.locator('#clearSearchButton').click();
    await page.locator('#themeToggle').click();
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    check('Favoris, dernière catégorie, recherche sans accents, état vide et thème persistants');

    await page.evaluate(() => localStorage.setItem('other-app-secret', 'do-not-export'));
    await page.locator('#editModeToggle').click();
    await page.locator('#settingsButton').click();
    await page.locator('#addPageButton').click();
    const customLabel = 'Voyages d’été';
    await page.locator('#newPageName').fill(customLabel);
    await page.locator('#addPageForm [type="submit"]').click();
    assert.equal(await page.locator('#sectionTitle').textContent(), customLabel);
    await page.locator('#settingsButton').click();
    await page.locator('#addShortcutButton').click();
    const literalName = '<img src=x onerror=alert(1)>';
    await page.locator('#shortcutName').fill(literalName);
    await page.locator('#shortcutURL').fill('https://example.org/mes-voyages');
    await page.locator('#addShortcutForm [type="submit"]').click();
    assert.equal(await page.locator('.shortcut-name').textContent(), literalName);
    assert.equal(await page.locator('#content img').count(), 0);
    await page.getByRole('button', { name: 'Modifier ' + literalName, exact: true }).click();
    await page.locator('#shortcutName').fill('Mon voyage');
    await page.locator('#addShortcutForm [type="submit"]').click();
    assert.equal(await page.locator('.shortcut-name').textContent(), 'Mon voyage');
    check('Création catégorie avec ponctuation, création/édition lien, contenu HTML affiché comme texte');

    const downloading = page.waitForEvent('download');
    await page.locator('#settingsButton').click();
    await page.locator('#shareButton').click();
    await page.locator('#exportConfigButton').evaluate(button => { button.closest('details').open = true; });
    await page.locator('#exportConfigButton').click();
    const download = await downloading;
    const exported = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
    assert.equal(exported.version, 2);
    assert.ok(!JSON.stringify(exported).includes('do-not-export'));
    const snapshot = await page.evaluate(() => localStorage.getItem('evportal.state.v2'));
    if (await page.locator('#shareDialog').isVisible()) await page.locator('#shareDialog [data-close-dialog]').first().click();
    if (!await page.locator('#settingsDialog').isVisible()) await page.locator('#settingsButton').click();
    await page.locator('#importConfigButton').click();
    await page.locator('#importFile').evaluate(input => { for (let node = input.parentElement; node; node = node.parentElement) if (node.tagName === 'DETAILS') node.open = true; });
    await page.locator('#importFile').setInputFiles(file({ pages: ['unsafe'], unsafe: [{ name: 'Unsafe', url: 'javascript:alert(1)', order: 1 }] }));
    await page.waitForFunction(() => document.querySelector('#importError').textContent.length > 0);
    assert.equal(await page.locator('#confirmRestoreButton').isVisible(), false);
    assert.equal(await page.evaluate(() => localStorage.getItem('evportal.state.v2')), snapshot);
    const legacy = { pages: ['Ma pause'], 'Ma pause': [{ name: 'Mon lien', url: 'https://example.org/', order: 2 }, { name: 'Premier lien', url: 'https://example.com/', order: 1 }] };
    await page.locator('#importFile').setInputFiles(file(legacy));
    await page.locator('#confirmRestoreButton').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => localStorage.getItem('evportal.state.v2')), snapshot);
    await page.locator('#confirmRestoreButton').click();
    assert.equal(await page.locator('.shortcut').count(), 2);
    assert.equal(await page.locator('.shortcut-name').first().textContent(), 'Premier lien');
    assert.equal(await page.evaluate(() => EVBackups.createLibrary(localStorage).list().length), 1);
    await page.locator('#settingsButton').click();
    await page.locator('#undoTransferButton').evaluate(button => { button.closest('details').open = true; });
    await page.locator('#undoTransferButton').click();
    assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem(EVState.STORAGE_KEY))), JSON.parse(snapshot));
    await page.locator('#settingsButton').click();
    await page.locator('#restoreBackupButton').click();
    await page.locator('#localBackupList .backup-select').click();
    await page.locator('#confirmRestoreButton').click();
    check('Export limité à EvPortal, ajout sans mutation, restauration explicite et annulation durable');

    await page.locator('#menu .menu-link').last().click();
    const handle = page.locator('.shortcut').filter({has:page.locator('.shortcut-name',{hasText:'Premier lien'})}).locator('.drag-handle');
    await handle.press('Space');
    await handle.press('ArrowRight');
    await handle.press('Enter');
    assert.equal(await page.locator('.shortcut-name').first().textContent(), 'Mon lien');
    await page.reload();
    assert.equal(await page.locator('.shortcut-name').first().textContent(), 'Mon lien');
    await page.locator('#catalogButton').click();
    await page.locator('#catalogSearch').fill('FIP');
    await page.getByRole('button', { name: 'Ajouter FIP', exact: true }).click();
    await page.locator('#catalogDialog [data-close-dialog]').click();
    assert.equal(Number(await page.locator('#shortcutTotal').textContent()), 3);
    await page.locator('#editModeToggle').click();
    await page.locator('#settingsButton').click();
    await page.locator('#resetButton').evaluate(button => { button.closest('details').open = true; });
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#resetButton').click();
    assert.equal(Number(await page.locator('#shortcutTotal').textContent()), total);
    assert.equal(await page.evaluate(() => localStorage.getItem('other-app-secret')), 'do-not-export');
    check('Réorganisation persistante, ajout depuis catalogue, réinitialisation préservant les autres applications');

    const oldContext = await context();
    await oldContext.addInitScript(() => {
        if (location.protocol !== 'http:') return;
        if (localStorage.getItem('test-seeded')) return;
        localStorage.setItem('test-seeded', 'yes');
        localStorage.setItem('pages', JSON.stringify(['tv', 'mes-liens']));
        localStorage.setItem('tv', JSON.stringify([{ name: '6play', url: 'https://www.6play.fr/', order: 1 }]));
        localStorage.setItem('mes-liens', JSON.stringify([{ name: 'Mon raccourci', url: 'https://example.org/custom', order: 1 }]));
    });
    const oldPage = await oldContext.newPage();
    await oldPage.goto(url);
    assert.equal(Number(await oldPage.locator('#shortcutTotal').textContent()), 2);
    assert.equal(await oldPage.locator('a[href="https://www.m6.fr/"]').count(), 1);
    assert.equal(await oldPage.evaluate(() => JSON.parse(localStorage.getItem('tv'))[0].url), 'https://www.6play.fr/');
    assert.ok(await oldPage.locator('#statusMessage').isVisible());
    check('Migration des données historiques, correction exacte 6play → M6+, anciennes clés conservées');

    const brokenContext = await context();
    await brokenContext.addInitScript(() => { if (location.protocol === 'http:') localStorage.setItem('evportal.state.v2', '{corrupted'); });
    const brokenPage = await brokenContext.newPage();
    await brokenPage.goto(url);
    assert.ok(await brokenPage.locator('.shortcut').count());
    await brokenPage.locator('#themeToggle').click();
    assert.equal(await brokenPage.evaluate(() => localStorage.getItem('evportal.state.v2')), '{corrupted');
    assert.match(await brokenPage.locator('#statusMessage').textContent(), /temporaires/);
    const blockedContext = await context();
    await blockedContext.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Denied', 'SecurityError'); } }));
    const blockedPage = await blockedContext.newPage();
    await blockedPage.goto(url);
    assert.ok(await blockedPage.locator('.shortcut').count());
    assert.ok(await blockedPage.locator('#statusMessage').isVisible());
    check('Stockage corrompu préservé et navigateur sans stockage utilisable en session temporaire');

    const remoteContext = await context();
    const remotePage = await remoteContext.newPage();
    const remoteRequests = [];
    remotePage.on('request', req => { if (req.url().includes('api.telegra.ph')) remoteRequests.push(req.url()); });
    await remotePage.goto(url + '?code=test-09-10');
    assert.equal(remoteRequests.length, 0);
    assert.ok(await remotePage.locator('#importDialog').isVisible());
    await remotePage.route('https://api.telegra.ph/**', route => route.fulfill({ json: { ok: true, result: { content: [{ tag: 'pre', children: [JSON.stringify(legacy)] }] } } }));
    await remotePage.locator('#telegraphImportForm [type="submit"]').click();
    await remotePage.locator('#confirmRestoreButton').waitFor({ state: 'visible' });
    assert.equal(remoteRequests.length, 1);
    assert.equal(Number(await remotePage.locator('#shortcutTotal').textContent()), total);
    await remotePage.locator('#confirmRestoreButton').click();
    assert.equal(Number(await remotePage.locator('#shortcutTotal').textContent()), 2);
    assert.equal(new URL(remotePage.url()).search, '');
    assert.equal(await remotePage.evaluate(() => EVBackups.createLibrary(localStorage).list().length), 1);
    check('Ancien partage sans requête automatique, Ajouter conserve les raccourcis et Restaurer les remplace');

    const savedState = await remotePage.evaluate(() => localStorage.getItem(EVState.STORAGE_KEY));
    await remotePage.locator('#settingsButton').click();
    await remotePage.locator('#restoreBackupButton').click();
    await remotePage.locator('#localBackupList .backup-select').click();
    await remotePage.evaluate(() => {
        window.originalBackupSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
            if (key === EVState.STORAGE_KEY) throw new DOMException('Full', 'QuotaExceededError');
            return window.originalBackupSetItem.call(this, key, value);
        };
    });
    const recoveryBefore = await remotePage.evaluate(() => localStorage.getItem('evportal.previous-transfer.v1'));
    await remotePage.locator('#confirmRestoreButton').click();
    assert.ok(await remotePage.locator('#restoreError').textContent());
    assert.equal(await remotePage.evaluate(() => localStorage.getItem(EVState.STORAGE_KEY)), savedState);
    assert.equal(await remotePage.evaluate(() => localStorage.getItem('evportal.previous-transfer.v1')), recoveryBefore);
    await remotePage.evaluate(() => { Storage.prototype.setItem = window.originalBackupSetItem; });
    await remotePage.locator('#restoreDialog [data-close-dialog]').click();

    await remotePage.locator('#settingsButton').click();
    await remotePage.locator('#importConfigButton').click();
    await remotePage.locator('#importConfigID').fill('cancelled-09-10');
    let releaseRequest;
    const delayed = new Promise(resolve => { releaseRequest = resolve; });
    await remotePage.route('**/getPage/cancelled-09-10*', async route => {
        await delayed;
        await route.fulfill({ json: { ok: true, result: { content: [{ tag: 'pre', children: [JSON.stringify(legacy)] }] } } }).catch(() => {});
    });
    const started = remotePage.waitForRequest('**/getPage/cancelled-09-10*');
    await remotePage.locator('#addBackupButton').click();
    await started;
    await remotePage.locator('#importDialog [data-close-dialog]').click();
    releaseRequest();
    await remotePage.waitForTimeout(150);
    assert.equal(await remotePage.evaluate(() => EVBackups.createLibrary(localStorage).list().length), 1);
    assert.equal(await remotePage.evaluate(() => localStorage.getItem(EVState.STORAGE_KEY)), savedState);
    check('Échec stockage restauration et ajout annulé ne modifient ni raccourcis ni récupération');

    await remotePage.locator('#settingsButton').click();
    await remotePage.locator('#restoreBackupButton').click();
    await remotePage.locator('#localBackupList .backup-select').click();
    const secondTab = await remoteContext.newPage();
    await secondTab.goto(url);
    await secondTab.evaluate(() => {
        const library = EVBackups.createLibrary(localStorage);
        library.remove(library.list()[0].id);
    });
    await remotePage.locator('#restorePreview').waitFor({ state: 'hidden' });
    assert.equal(await remotePage.locator('#localBackupList .backup-select').count(), 0);
    assert.equal(await remotePage.evaluate(() => localStorage.getItem(EVState.STORAGE_KEY)), savedState);
    await secondTab.close();
    check('Suppression dans un autre onglet invalide la sauvegarde sélectionnée sans toucher aux raccourcis');

    const preferencesContext = await context();
    const preferencesPage = await preferencesContext.newPage();
    await preferencesPage.goto(url, { waitUntil: 'networkidle' });
    const installedIDs = () => preferencesPage.evaluate(() => JSON.parse(localStorage.getItem(EVState.STORAGE_KEY)).categories.flatMap(category => category.shortcuts).map(shortcut => shortcut.serviceId));
    assert.equal((await installedIDs()).includes('github'), false, 'GitHub is available on demand, not installed by default');
    await preferencesPage.locator('#editModeToggle').click();
    await preferencesPage.getByRole('button', { name: 'Ajouter Netflix aux favoris', exact: true }).click();
    await preferencesPage.locator('#editModeToggle').click();
    await preferencesPage.locator('#catalogButton').click();
    await preferencesPage.locator('#catalogSearch').fill('Crave');
    assert.equal(await preferencesPage.locator('.catalog-item[data-service-id="crave"]').count(), 0);
    await preferencesPage.locator('#catalogMarketToggle').check();
    assert.equal(await preferencesPage.getByRole('button', { name: 'Ajouter Crave', exact: true }).isVisible(), true);
    await preferencesPage.locator('#catalogMarketToggle').uncheck();
    assert.equal(await preferencesPage.locator('.catalog-item[data-service-id="crave"]').count(), 0);
    await preferencesPage.locator('#catalogDialog [data-close-dialog]').click();
    const beforeCountry = await preferencesPage.evaluate(() => localStorage.getItem(EVState.STORAGE_KEY));
    await preferencesPage.locator('#settingsButton').click();
    await preferencesPage.locator('#catalogPreferences').evaluate(details => { details.open = true; });
    assert.equal(await preferencesPage.locator('#marketSelect').inputValue(), 'FR');
    await preferencesPage.locator('#marketSelect').selectOption('CA');
    assert.equal(await preferencesPage.evaluate(() => localStorage.getItem(EVState.STORAGE_KEY)), beforeCountry, 'Country changes suggestions without rewriting installed shortcuts');
    await preferencesPage.locator('#homeFavoritesToggle').check();
    await preferencesPage.locator('#categoryVisibilityOptions input[value="cinema"]').uncheck();
    await preferencesPage.locator('#settingsDialog [data-close-dialog]').first().click();
    assert.equal(await preferencesPage.locator('#menu [data-category="cinema"]').count(), 0);
    await preferencesPage.locator('[data-category="all"]').click();
    assert.equal(await preferencesPage.locator('#content .shortcut-name', { hasText: /^Netflix$/ }).count(), 1);
    await preferencesPage.locator('[data-category="favorites"]').click();
    assert.equal(await preferencesPage.locator('#content .shortcut-name').textContent(), 'Netflix');
    await preferencesPage.locator('[data-category="all"]').click();
    await preferencesPage.reload({ waitUntil: 'networkidle' });
    assert.equal(await preferencesPage.locator('#sectionTitle').textContent(), 'Mes favoris');
    assert.equal(await preferencesPage.locator('#menu [data-category="cinema"]').count(), 0);
    await preferencesPage.locator('#catalogButton').click();
    await preferencesPage.locator('#catalogSearch').fill('Crave');
    assert.equal(await preferencesPage.getByRole('button', { name: 'Ajouter Crave', exact: true }).isVisible(), true);
    await preferencesPage.locator('#catalogSearch').fill('GitHub');
    await preferencesPage.getByRole('button', { name: 'Ajouter GitHub', exact: true }).click();
    assert.equal((await installedIDs()).filter(id => id === 'github').length, 1);
    assert.equal(await preferencesPage.getByRole('button', { name: 'Déjà présent : GitHub', exact: true }).isDisabled(), true);
    await preferencesPage.locator('#catalogDialog [data-close-dialog]').click();
    await preferencesPage.locator('#settingsButton').click();
    assert.equal(await preferencesPage.locator('#marketSelect').inputValue(), 'CA');
    const localPreferences = await preferencesPage.evaluate(() => localStorage.getItem(EVPreferences.STORAGE_KEY));
    await preferencesPage.locator('#languageSelect').selectOption('en');
    assert.equal(await preferencesPage.locator('#marketSelect').inputValue(), 'CA');
    assert.equal(await preferencesPage.evaluate(() => localStorage.getItem(EVPreferences.STORAGE_KEY)), localPreferences);
    await preferencesPage.locator('#languageSelect').selectOption('fr');
    await preferencesPage.locator('#shareButton').click();
    await preferencesPage.locator('#exportConfigButton').evaluate(button => { button.closest('details').open = true; });
    const preferencesDownload = preferencesPage.waitForEvent('download');
    await preferencesPage.locator('#exportConfigButton').click();
    const portableJSON = await fs.readFile(await (await preferencesDownload).path(), 'utf8');
    const telegraphContent = await preferencesPage.evaluate(() => EVTelegraph.contentForState(JSON.parse(localStorage.getItem(EVState.STORAGE_KEY))));
    for (const key of ['homeFavorites', 'market', 'hiddenCategoryIds']) {
        assert.equal(portableJSON.includes('"' + key + '":'), false, 'JSON excludes device preference ' + key);
        assert.equal(telegraphContent.includes('\\"' + key + '\\":'), false, 'Telegra.ph excludes device preference ' + key);
    }
    check('Pays indépendant de la langue, catalogue international à la demande, GitHub optionnel, catégories masquées sans perte, accueil Favoris local et préférences absentes des exports');

    // Accessibility and layout checks on a clean dashboard, in both themes.
    const visualContext = await context();
    const visualPage = await visualContext.newPage();
    await visualPage.goto(url, { waitUntil: 'networkidle' });
    const axePath = require.resolve('axe-core/axe.min.js');
    const audits = [];
    for (const width of [320, 390, 768, 1024, 1440, 1920]) {
        await visualPage.setViewportSize({ width, height: 1000 });
        assert.equal(await visualPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'Overflow at ' + width);
    }
    for (const theme of ['dark', 'light']) {
        for (const width of [390, 1440]) {
            await visualPage.setViewportSize({ width, height: 1000 });
            await visualPage.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
            await visualPage.addScriptTag({ path: axePath });
            const audit = await visualPage.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
            audits.push({ theme, width, violations: audit.violations });
            await visualPage.screenshot({ path: path.join(output, theme + '-' + width + '.png'), fullPage: true });
        }
    }
    await fs.writeFile(path.join(output, 'accessibility.json'), JSON.stringify(audits, null, 2));
    const violations = audits.flatMap(a => a.violations.map(v => ({ theme: a.theme, width: a.width, id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })));
    if (violations.length) throw new Error('Accessibilité : ' + JSON.stringify(violations.map(v => ({ theme: v.theme, width: v.width, rule: v.id, affected: v.nodes.length, examples: v.nodes.slice(0, 3) })), null, 2));
    assert.deepEqual(errors, []);
    check('Six tailles sans débordement, quatre audits axe sans violation WCAG A/AA détectée, aucune erreur JavaScript');
    await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify({ checks, errors, accessibility: audits.map(a => ({ theme: a.theme, width: a.width, violations: a.violations.length })) }, null, 2));
    console.log('\n' + checks.length + ' groupes de vérifications réussis. Captures et rapports : test-results/');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
});
