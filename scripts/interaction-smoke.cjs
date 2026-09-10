/* Actual mouse, touchscreen, and keyboard interaction checks against a local server. */
'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
const server = http.createServer(async (req, res) => {
    try {
        const filename = path.resolve(root, decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/EvPortal\//, '').replace(/^\//, '') || 'index.html');
        if (!filename.startsWith(root + path.sep)) throw new Error('Invalid path');
        const data = await fs.readFile(filename);
        res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream' });
        res.end(data);
    } catch (_) { res.writeHead(404); res.end('Not found'); }
});
const fixture = {
    version: 2, activeCategory: 'all', theme: 'dark',
    categories: [
        { id: 'first', label: 'Première', shortcuts: [
            { id: 'a', name: 'Alpha', url: 'https://alpha.example/', favorite: true },
            { id: 'b', name: 'Beta', url: 'https://beta.example/' }
        ] },
        { id: 'second', label: 'Seconde', shortcuts: [
            { id: 'c', name: 'Gamma', url: 'https://gamma.example/', favorite: true },
            { id: 'd', name: 'Delta', url: 'https://delta.example/' }
        ] }
    ]
};
let browser;
const errors = [];
(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const url = origin + '/EvPortal/';
    browser = await chromium.launch({ headless: true, channel: 'chromium' });
    const contexts = [];
    async function pageFor(options = {}) {
        const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR', reducedMotion: 'reduce', ...options });
        contexts.push(context);
        await context.route('**/*', route => {
            const requested = new URL(route.request().url());
            if (requested.origin === origin) return route.continue();
            if (requested.hostname.endsWith('.example')) return route.fulfill({ contentType: 'text/html', body: '<title>Test shortcut</title>Opened in a new tab' });
            return route.abort();
        });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(url, { waitUntil: 'networkidle' });
        await page.evaluate(state => localStorage.setItem(EVState.STORAGE_KEY, JSON.stringify(state)), fixture);
        await page.reload({ waitUntil: 'networkidle' });
        return page;
    }
    const ids = page => page.locator('#content > .shortcut').evaluateAll(nodes => nodes.map(node => node.dataset.shortcutId));
    const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem(EVState.STORAGE_KEY)));
    const desktop = await pageFor();
    await desktop.locator('#editModeToggle').click();
    assert.equal(await desktop.getByRole('button', { name: /Avancer|Reculer|Monter|Descendre/ }).count(), 0);
    assert.equal(await desktop.locator('#content .drag-handle').count(), 0);
    assert.match(await desktop.locator('#editControls').textContent(), /plus utilisés/);
    await desktop.locator('[data-category="first"]').click();
    const alpha = desktop.locator('[data-shortcut-id="a"] .drag-handle');
    await alpha.focus();
    await alpha.press('Space');
    await alpha.press('ArrowRight');
    await alpha.press('Enter');
    assert.deepEqual(await ids(desktop), ['b', 'a']);
    assert.deepEqual((await saved(desktop)).shortcutOrder, ['b', 'a', 'c', 'd']);
    await alpha.press('Space');
    await alpha.press('ArrowRight');
    await alpha.press('Escape');
    assert.deepEqual(await ids(desktop), ['b', 'a']);
    console.log('✓ Keyboard grab, move, drop, and Escape restore; no movement arrow buttons');

    await desktop.locator('[data-category="favorites"]').click();
    const favorite = desktop.locator('[data-shortcut-id="a"] .drag-handle');
    await favorite.press('Space');
    await favorite.press('ArrowRight');
    await favorite.press('Enter');
    assert.deepEqual(await ids(desktop), ['c', 'a']);
    assert.deepEqual((await saved(desktop)).shortcutOrder, ['b', 'c', 'a', 'd']);
    assert.deepEqual((await saved(desktop)).categories.map(category => category.shortcuts.map(item => item.id)), [['b', 'a'], ['c', 'd']]);
    await desktop.reload({ waitUntil: 'networkidle' });
    assert.deepEqual(await ids(desktop), ['c', 'a']);
    console.log('✓ Mixed-category favorite order survives reload and preserves hidden tile positions');

    await desktop.locator('[data-category="first"]').click();
    await desktop.locator('#editModeToggle').click();
    const beforeMouse = await ids(desktop);
    const mouseStart = await desktop.locator('#content .drag-handle').first().boundingBox();
    const mouseTarget = await desktop.locator('#content .shortcut').nth(1).boundingBox();
    await desktop.mouse.move(mouseStart.x + mouseStart.width / 2, mouseStart.y + mouseStart.height / 2);
    await desktop.mouse.down();
    await desktop.mouse.move(mouseStart.x + mouseStart.width / 2 + 8, mouseStart.y + mouseStart.height / 2, { steps: 3 });
    await desktop.mouse.move(mouseTarget.x + mouseTarget.width * .8, mouseTarget.y + mouseTarget.height / 2, { steps: 20 });
    await desktop.waitForTimeout(300);
    await desktop.mouse.up();
    await desktop.waitForTimeout(80);
    assert.notDeepEqual(await ids(desktop), beforeMouse);
    const afterMouse = await ids(desktop);
    await desktop.reload({ waitUntil: 'networkidle' });
    assert.deepEqual(await ids(desktop), afterMouse);
    console.log('✓ Actual desktop pointer drag saves and survives reload');

    await desktop.locator('#editModeToggle').click();
    const tileLink = desktop.locator('#content .shortcut-link').first();
    assert.equal(await tileLink.getAttribute('target'), '_blank');
    assert.equal(await tileLink.getAttribute('rel'), 'noopener noreferrer');
    await tileLink.click();
    assert.equal(desktop.url(), url);
    const categoryHandle = desktop.locator('.category-item[data-category-id="first"] .category-drag-handle');
    await categoryHandle.press('Space');
    await categoryHandle.press('ArrowRight');
    await categoryHandle.press('Enter');
    assert.deepEqual((await saved(desktop)).categories.map(category => category.id), ['second', 'first']);
    assert.equal(await desktop.locator('.category-item [data-category]').first().getAttribute('data-category'), 'all');
    assert.equal(await desktop.locator('.category-item [data-category]').nth(1).getAttribute('data-category'), 'favorites');
    console.log('✓ Category reordering keeps navigation shortcuts fixed; tiles never navigate during editing');

    const touch = await pageFor({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await touch.locator('[data-category="first"]').tap();
    await touch.locator('#editModeToggle').tap();
    const beforeTouch = await ids(touch);
    const start = await touch.locator('#content .drag-handle').first().boundingBox();
    const target = await touch.locator('#content .shortcut').nth(1).boundingBox();
    const client = await touch.context().newCDPSession(touch);
    const point = (x, y) => [{ x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }];
    const from = { x: start.x + start.width / 2, y: start.y + start.height / 2 };
    const to = { x: target.x + target.width * .8, y: target.y + target.height / 2 };
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(from.x, from.y) });
    await touch.waitForTimeout(180);
    for (let i = 1; i <= 18; i++) {
        await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(from.x + (to.x - from.x) * i / 18, from.y + (to.y - from.y) * i / 18) });
        await touch.waitForTimeout(15);
    }
    await touch.waitForTimeout(160);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await touch.waitForTimeout(100);
    assert.notDeepEqual(await ids(touch), beforeTouch);
    const afterTouch = await ids(touch);
    await touch.reload({ waitUntil: 'networkidle' });
    assert.deepEqual(await ids(touch), afterTouch);
    assert.equal((await saved(touch)).categories.flatMap(category => category.shortcuts).every(shortcut => shortcut.clickCount === 0), true);
    console.log('✓ Actual touch events reorder tiles on 390px viewport and survive reload');

    const usage = await pageFor();
    const clickCount = async (page, id) => (await saved(page)).categories.flatMap(category => category.shortcuts).find(shortcut => shortcut.id === id).clickCount;
    async function openShortcut(page, id, activation = 'click') {
        const link = page.locator('[data-shortcut-id="' + id + '"] .shortcut-link');
        const targetURL = await link.getAttribute('href');
        const popupPromise = page.context().waitForEvent('page');
        if (activation === 'keyboard') await link.press('Enter');
        else if (activation === 'touch') await link.tap();
        else await link.click(activation === 'middle' ? { button: 'middle' } : {});
        const popup = await popupPromise;
        await popup.bringToFront();
        await popup.waitForURL(targetURL, { timeout: 5000 }).catch(error => {
            throw new Error('Expected ' + targetURL + ', actual ' + popup.url() + ', activation ' + activation, { cause: error });
        });
        await popup.waitForLoadState('domcontentloaded');
        assert.equal(await popup.evaluate(() => window.opener), null);
        assert.equal(page.url(), url);
        await popup.close();
        await page.bringToFront();
        // Headless Chromium may keep all pages visible: revisit Tous explicitly,
        // just as selecting the category after returning from a service.
        if ((await saved(page)).activeCategory === 'all') await page.locator('[data-category="all"]').click();
    }
    await openShortcut(usage, 'd');
    assert.equal(await clickCount(usage, 'd'), 1);
    await usage.waitForFunction(() => document.querySelector('#content .shortcut').dataset.shortcutId === 'd');
    assert.deepEqual(await ids(usage), ['d', 'a', 'b', 'c']);
    await openShortcut(usage, 'b', 'keyboard');
    assert.equal(await clickCount(usage, 'b'), 1);
    assert.deepEqual(await ids(usage), ['b', 'd', 'a', 'c']);
    await openShortcut(usage, 'd', 'middle');
    assert.equal(await clickCount(usage, 'd'), 2);
    assert.deepEqual(await ids(usage), ['d', 'b', 'a', 'c']);
    await usage.locator('[data-shortcut-id="a"] .shortcut-link').click({ button: 'right' });
    await usage.keyboard.press('Escape');
    await usage.locator('[data-shortcut-id="a"] .favorite-toggle').click();
    assert.equal(await clickCount(usage, 'a'), 0);
    await usage.locator('#editModeToggle').click();
    const pagesBeforeEditing = usage.context().pages().length;
    await usage.locator('[data-shortcut-id="a"] .shortcut-link').click();
    await usage.locator('[data-shortcut-id="a"] .shortcut-link').click({ button: 'middle' });
    assert.equal(usage.context().pages().length, pagesBeforeEditing);
    assert.equal(await clickCount(usage, 'a'), 0);
    await usage.locator('[data-category="first"]').click();
    assert.deepEqual(await ids(usage), ['a', 'b']);
    await usage.locator('[data-category="all"]').click();
    await usage.reload({ waitUntil: 'networkidle' });
    assert.deepEqual(await ids(usage), ['d', 'b', 'a', 'c']);
    await openShortcut(touch, afterTouch[0], 'touch');
    assert.equal(await clickCount(touch, afterTouch[0]), 1);
    console.log('✓ Click, keyboard, middle-click and tap open isolated tabs; usage sorts Tous and persists without counting edits, favorites or drags');

    const custom = await pageFor();
    await custom.locator('#catalogButton').click();
    await custom.locator('#catalogCustomButton').click();
    assert.equal(await custom.locator('#shortcutDialog').evaluate(dialog => dialog.open), true);
    assert.equal(await custom.locator('#catalogDialog').evaluate(dialog => dialog.open), false);
    await custom.locator('#shortcutName').fill('Mon service');
    await custom.locator('#shortcutURL').fill('https://custom.example/');
    await custom.locator('#addShortcutForm [type="submit"]').click();
    const ownShortcut = (await saved(custom)).categories.flatMap(category => category.shortcuts).find(shortcut => shortcut.name === 'Mon service');
    assert.equal(ownShortcut.clickCount, 0);
    assert.equal(await custom.locator('[data-shortcut-id="' + ownShortcut.id + '"] .shortcut-link').getAttribute('target'), '_blank');
    for (const name of ['Mes recharges', 'Voyages', 'Famille']) {
        await custom.locator('#catalogButton').click();
        await custom.locator('#catalogCategoryButton').click();
        await custom.locator('#newPageName').fill(name);
        await custom.locator('input[name="categoryIcon"][value="charging"]').check();
        await custom.locator('#addPageForm [type="submit"]').click();
        assert.equal(await custom.locator('#pageDialog').evaluate(dialog => dialog.open), false);
    }
    const category = (await saved(custom)).categories.find(category => category.label === 'Mes recharges');
    assert.equal(category.icon, 'charging');
    assert.equal(await custom.locator('[data-category="' + category.id + '"] use').getAttribute('href'), '#icon-charging');
    await custom.locator('#catalogButton').click();
    await custom.locator('#catalogCategoryButton').click();
    assert.equal(await custom.locator('#addPageForm [type="submit"]').isDisabled(), true);
    assert.match(await custom.locator('#categoryLimitHint').textContent(), /Limite atteinte/);
    await custom.locator('#pageDialog [data-close-dialog]').first().click();
    await custom.locator('#editModeToggle').click();
    await custom.getByRole('button', { name: 'Modifier la catégorie Mes recharges', exact: true }).click();
    await custom.locator('#newPageName').fill('Mes pauses');
    await custom.locator('input[name="categoryIcon"][value="music"]').check();
    assert.equal(await custom.locator('#addPageForm [type="submit"]').isEnabled(), true);
    await custom.locator('#addPageForm [type="submit"]').click();
    await custom.reload({ waitUntil: 'networkidle' });
    const renamed = (await saved(custom)).categories.find(item => item.id === category.id);
    assert.equal(renamed.label, 'Mes pauses');
    assert.equal(renamed.icon, 'music');
    assert.equal(await custom.locator('#themeToggle').isVisible(), true);
    assert.equal(await custom.locator('#themeToggle svg').count(), 1);
    await custom.locator('#themeToggle').click();
    assert.equal((await saved(custom)).theme, 'light');
    assert.equal(await custom.locator('#themeToggle').getAttribute('aria-label'), 'Passer en mode sombre');
    assert.equal(await custom.locator('#themeToggle use').getAttribute('href'), '#icon-moon');
    assert.equal(await custom.locator('#themeToggle').textContent(), '');
    await custom.locator('#themeToggle').click();
    assert.equal((await saved(custom)).theme, 'dark');
    assert.equal(await custom.locator('#themeToggle use').getAttribute('href'), '#icon-sun');
    assert.equal(await custom.locator('#themeToggle svg').count(), 1);
    console.log('✓ Add creates custom tiles; five custom categories have editable matching icons; visible theme control preserves its icon');

    const multilingual = await pageFor();
    const originalSettings = await saved(multilingual);
    await multilingual.locator('#settingsButton').click();
    await multilingual.locator('#languageSelect').selectOption('en');
    assert.equal(await multilingual.locator('html').getAttribute('lang'), 'en');
    assert.equal(await multilingual.locator('[data-category="first"] .category-label').textContent(), 'Première');
    assert.deepEqual(await saved(multilingual), originalSettings);
    await multilingual.locator('#settingsDialog [data-close-dialog]').first().click();
    await multilingual.reload({ waitUntil: 'networkidle' });
    assert.equal(await multilingual.locator('html').getAttribute('lang'), 'en');
    await multilingual.locator('#catalogButton').click();
    await multilingual.locator('#catalogCustomButton').click();
    await multilingual.locator('#shortcutName').fill('My draft shortcut');
    await multilingual.locator('#shortcutURL').fill('https://draft.example/?lang=original');
    await multilingual.evaluate(() => EVI18n.setLanguage('ar'));
    assert.equal(await multilingual.locator('html').getAttribute('dir'), 'rtl');
    assert.equal(await multilingual.locator('#shortcutName').inputValue(), 'My draft shortcut');
    assert.equal(await multilingual.locator('#shortcutURL').inputValue(), 'https://draft.example/?lang=original');
    assert.equal(await multilingual.locator('#shortcutDialogTitle').textContent(), await multilingual.evaluate(() => EVI18n.t('app.addShortcutTitle')));
    assert.equal(await multilingual.locator('#shortcutDialog').evaluate(dialog => dialog.open), true);
    await multilingual.locator('#shortcutDialog [data-close-dialog]').first().click();
    await multilingual.locator('#editModeToggle').click();
    const rtlCategoryHandle = multilingual.locator('.category-item[data-category-id="first"] .category-drag-handle');
    await rtlCategoryHandle.press('Space');
    await rtlCategoryHandle.press('ArrowLeft');
    await rtlCategoryHandle.press('Enter');
    assert.deepEqual((await saved(multilingual)).categories.map(category => category.id), ['second', 'first']);
    await multilingual.locator('[data-category="first"]').click();
    const rtlShortcutHandle = multilingual.locator('[data-shortcut-id="a"] .drag-handle');
    await rtlShortcutHandle.press('Space');
    await rtlShortcutHandle.press('ArrowLeft');
    await rtlShortcutHandle.press('Enter');
    assert.deepEqual(await ids(multilingual), ['b', 'a']);
    await multilingual.evaluate(() => EVI18n.setLanguage('fr'));
    assert.equal(await multilingual.locator('html').getAttribute('dir'), 'ltr');
    assert.equal(await multilingual.locator('#editModeToggle').textContent(), 'Terminer');
    assert.equal(await multilingual.locator('[data-category="first"] .category-label').textContent(), 'Première');
    console.log('✓ Language setting persists independently, Arabic preserves drafts and custom labels, keyboard reordering follows RTL direction');

    const tesla = await pageFor({ userAgent: 'Mozilla/5.0 Tesla/2026.20' });
    await tesla.addInitScript(() => Object.defineProperty(document, 'fullscreenEnabled', { value: false, configurable: true }));
    await tesla.reload({ waitUntil: 'networkidle' });
    assert.equal(await tesla.locator('#fullscreenButton').isVisible(), true);
    let redirect;
    await tesla.route('https://www.youtube.com/redirect?*', route => { redirect = route.request().url(); return route.fulfill({ contentType: 'text/html', body: 'Mock Theater transition' }); });
    await tesla.locator('#fullscreenButton').click();
    await tesla.waitForURL('https://www.youtube.com/redirect?*');
    assert.equal(new URL(redirect).searchParams.get('q'), url);
    console.log('✓ Tesla button launches same-tab Theater redirect with actual deployment URL');
    assert.deepEqual(errors, []);
    await Promise.all(contexts.map(context => context.close()));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
});
