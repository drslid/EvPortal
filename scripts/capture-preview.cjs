/* Reproducible browser captures, with synthetic favorites and no external requests. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.json': 'application/json' };
const server = http.createServer(async (request, response) => {
    try {
        const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        let filename = path.resolve(root, '.' + relative);
        if (!filename.startsWith(root + path.sep)) throw new Error('Invalid path');
        if ((await fs.stat(filename)).isDirectory()) filename = path.join(filename, 'index.html');
        const data = await fs.readFile(filename);
        response.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream' });
        response.end(data);
    } catch (_) { response.writeHead(404); response.end('Not found'); }
});

let browser;
(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({ headless: true, channel: 'chromium' });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'en-US', colorScheme: 'dark', reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
        if (new URL(route.request().url()).origin === origin) return route.continue();
        errors.push('Unexpected external request');
        return route.abort();
    });
    await page.goto(origin + '/en/', { waitUntil: 'networkidle' });
    await page.evaluate(() => {
        const wanted = ['abrp', 'chargemap', 'chargefinder', 'google-maps', 'windy', 'spotify', 'tunein', 'youtube', 'netflix', 'disney-plus', 'plex'];
        const state = EVState.fromCatalog(EV_CATALOG);
        const rows = EVState.allShortcutEntries(state);
        for (const { shortcut } of rows) shortcut.favorite = wanted.includes(shortcut.serviceId);
        const selected = rows.filter(row => row.shortcut.favorite).sort((a, b) => wanted.indexOf(a.shortcut.serviceId) - wanted.indexOf(b.shortcut.serviceId));
        if (selected.length !== wanted.length) throw new Error('Update the demo selection to match the catalogue');
        state.shortcutOrder = selected.concat(rows.filter(row => !row.shortcut.favorite)).map(row => row.shortcut.id);
        state.activeCategory = 'favorites';
        localStorage.setItem(EVState.STORAGE_KEY, JSON.stringify(state));
        EVPreferences.createPreferences().patch({ shortcutSize: 'standard', showShortcutNames: true });
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('#content > .shortcut').count(), 11);
    await page.screenshot({ path: path.join(root, 'img/evportal-dashboard.png') });
    await page.evaluate(() => EVPreferences.createPreferences().patch({ shortcutSize: 'small', showShortcutNames: false }));
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('html').getAttribute('data-shortcut-size'), 'small');
    assert.equal(await page.locator('#content .shortcut-name').first().isVisible(), false);
    await page.screenshot({ path: path.join(root, 'img/evportal-compact.png') });
    assert.deepEqual(errors, []);
    console.log('Captured img/evportal-dashboard.png and img/evportal-compact.png (1440 × 900, synthetic favorites).');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
    if (browser) await browser.close();
    if (server.listening) await new Promise(resolve => server.close(resolve));
});
