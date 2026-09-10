/* Exercise the actual multilingual interface, responsive categories and RTL. */
'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const dictionaries = require('../js/translations.js');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer(async (req, res) => {
    try {
        const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/EvPortal\//, '').replace(/^\//, '') || 'index.html';
        const filename = path.resolve(root, relative);
        if (!filename.startsWith(root + path.sep)) throw Error('Invalid path');
        res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream' });
        res.end(await fs.readFile(filename));
    } catch (_) { res.writeHead(404); res.end('Not found'); }
});
const widths = [320, 390, 768, 1024, 1440, 1920];
const locales = { en: 'en-US', fr: 'fr-FR', es: 'es-ES', de: 'de-DE', it: 'it-IT', ru: 'ru-RU', ar: 'ar-SA', pt: 'pt-BR' };
let browser;
(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const appURL = origin + '/EvPortal/';
    browser = await chromium.launch({ headless: true, channel: 'chromium' });
    await fs.mkdir(path.join(root, 'test-results'), { recursive: true });
    const errors = [];
    for (const [language, locale] of Object.entries(locales)) {
        const context = await browser.newContext({ locale, colorScheme: 'dark', reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 } });
        await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(language + ': ' + error.message));
        await page.goto(appURL, { waitUntil: 'networkidle' });
        assert.equal(await page.locator('html').getAttribute('lang'), language, 'Browser language detection');
        assert.equal(await page.locator('html').getAttribute('dir'), language === 'ar' ? 'rtl' : 'ltr');
        assert.equal(await page.locator('[data-category="charging"] .category-label').textContent(), dictionaries[language]['category.charging']);
        assert.equal(await page.locator('#shareButton span').textContent(), dictionaries[language]['static.share']);
        assert.equal(await page.title(), dictionaries[language]['static.title']);
        assert.equal(await page.locator('#themeToggle').innerText(), '', 'Theme is an icon only');
        assert.equal(await page.locator('#themeToggle use').getAttribute('href'), '#icon-sun');
        await page.locator('#themeToggle').click();
        assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
        assert.equal(await page.locator('#themeToggle use').getAttribute('href'), '#icon-moon');
        await page.locator('#themeToggle').click();
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem(EVState.STORAGE_KEY)).theme), 'dark');
        for (const width of widths) {
            await page.setViewportSize({ width, height: 1000 });
            const geometry = await page.evaluate(() => {
                const menu = document.getElementById('menu');
                const theme = document.getElementById('themeToggle').getBoundingClientRect();
                const settings = document.getElementById('settingsButton').getBoundingClientRect();
                const bounds = menu.getBoundingClientRect();
                const buttons = [...menu.querySelectorAll('.menu-link')].map(button => button.getBoundingClientRect());
                const logo = document.querySelector('.brand-logo').getBoundingClientRect();
                const content = document.getElementById('content').getBoundingClientRect();
                const rows = new Map();
                document.querySelectorAll('#content > .shortcut').forEach(card => {
                    const r = card.getBoundingClientRect(), y = Math.round(r.top);
                    const row = rows.get(y) || { left: r.left, right: r.right };
                    row.left = Math.min(row.left, r.left); row.right = Math.max(row.right, r.right); rows.set(y, row);
                });
                return {
                    pageOverflow: document.documentElement.scrollWidth - innerWidth,
                    menuOverflow: menu.scrollWidth - menu.clientWidth,
                    allCategoriesVisible: buttons.every(r => r.width > 0 && r.left >= bounds.left - 1 && r.right <= bounds.right + 1),
                    themeLeft: theme.right <= settings.left + 1 && Math.abs(theme.top - settings.top) < 1,
                    centeredLogo: Math.abs((logo.left + logo.right) / 2 - innerWidth / 2) < 1,
                    centeredRows: [...rows.values()].every(r => Math.abs((r.left + r.right) / 2 - (content.left + content.right) / 2) < 1)
                };
            });
            assert.ok(geometry.pageOverflow <= 1, language + ' page overflow at ' + width);
            assert.ok(geometry.menuOverflow <= 1, language + ' category overflow at ' + width);
            assert.ok(geometry.allCategoriesVisible, language + ' hidden category at ' + width);
            assert.ok(geometry.themeLeft, language + ' theme position at ' + width);
            assert.ok(geometry.centeredLogo && geometry.centeredRows, language + ' centering at ' + width);
            if (['fr', 'ar', 'de'].includes(language) && [390, 1440].includes(width)) {
                await page.screenshot({ path: path.join(root, 'test-results', 'i18n-' + language + '-' + width + '.png'), fullPage: true });
            }
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator('#settingsButton').click();
        assert.equal(await page.locator('#languageSelect option').count(), 8);
        assert.equal(await page.locator('#settingsTitle').textContent(), dictionaries[language]['static.settings']);
        const before = await page.evaluate(() => localStorage.getItem(EVState.STORAGE_KEY));
        const other = language === 'en' ? 'fr' : 'en';
        await page.locator('#languageSelect').selectOption(other);
        assert.equal(await page.locator('html').getAttribute('lang'), other);
        await page.locator('#languageSelect').selectOption(language);
        assert.equal(await page.evaluate(() => localStorage.getItem(EVState.STORAGE_KEY)), before, 'Language leaves shortcut configuration untouched');
        await page.locator('#importConfigButton').click();
        assert.equal(await page.locator('#importDialogTitle').textContent(), dictionaries[language]['static.restore']);
        await page.locator('#importConfigID').fill('not/a/page');
        await page.locator('#telegraphImportForm button[type="submit"]').click();
        assert.equal(await page.locator('#importError').textContent(), dictionaries[language]['state.telegraphID']);
        await page.locator('#importDialog [data-close-dialog]').first().click();
        await page.locator('#shareButton').click();
        assert.equal(await page.locator('#shareTitle').inputValue(), dictionaries[language]['static.defaultBackup']);
        assert.equal(await page.locator('#sharePublishButton').textContent(), dictionaries[language]['static.publish']);
        assert.ok(await page.locator('#shareDialog').evaluate(node => node.scrollWidth <= node.clientWidth + 1));
        await page.locator('#shareDialog [data-close-dialog]').first().click();
        await page.locator('#catalogButton').click();
        assert.equal(await page.locator('#catalogCustomButton span').textContent(), dictionaries[language]['static.createShortcut']);
        assert.ok(await page.locator('#catalogDialog').evaluate(node => node.scrollWidth <= node.clientWidth + 1));
        await page.locator('#catalogCategoryButton').click();
        assert.equal(await page.locator('#pageDialogTitle').textContent(), dictionaries[language]['app.newCategory']);
        assert.equal(await page.locator('#categoryIconPicker input').count(), 13);
        assert.ok(await page.locator('#pageDialog').evaluate(node => node.scrollWidth <= node.clientWidth + 1));
        await page.reload({ waitUntil: 'networkidle' });
        assert.equal(await page.locator('html').getAttribute('lang'), language);
        await page.goto(appURL + 'aide.html', { waitUntil: 'networkidle' });
        assert.equal(await page.locator('html').getAttribute('lang'), language);
        assert.equal(await page.locator('h1').textContent(), dictionaries[language]['help.heading']);
        assert.equal(await page.locator('#languageSelect').inputValue(), language);
        assert.equal(await page.locator('html').getAttribute('dir'), language === 'ar' ? 'rtl' : 'ltr');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), language + ' help overflow');
        assert.equal(await page.evaluate(() => [...document.querySelectorAll('[data-i18n]')].every(node => node.textContent === EVI18n.t(node.dataset.i18n))), true, 'Help is fully translated');
        await context.close();
        console.log('✓ ' + language + ': language, theme, 6 widths, categories, import errors, sharing, help and persistence');
    }
    assert.deepEqual(errors, []);
    console.log('8 languages verified across 48 layouts; no horizontal category scrolling or JavaScript errors.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
});
