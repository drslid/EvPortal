/* Read the generated HTML and exercise its actual routes. No external services or writes. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const dictionaries = require('../js/translations.js');
const root = path.resolve(__dirname, '..');
const PUBLIC = 'https://drslid.github.io/EvPortal/';
const languages = ['en', 'fr', 'es', 'de', 'it', 'ru', 'ar', 'pt'];
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.ico': 'image/x-icon', '.xml': 'application/xml' };
const server = http.createServer(async (request, response) => {
    try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        let relative = pathname.replace(/^\/EvPortal(?:\/|$)/, '/').replace(/^\//, '');
        if (!relative || relative.endsWith('/')) relative += 'index.html';
        const filename = path.resolve(root, relative);
        if (!filename.startsWith(root + path.sep)) throw Error('Invalid path');
        const data = await fs.readFile(filename);
        response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream' });
        response.end(data);
    } catch (_) { response.writeHead(404); response.end('Not found'); }
});
const failures = [], externalRequests = [], missingAssets = [];
let browser, origin;
const metadata = page => page.evaluate(() => ({
    title: document.title,
    description: document.querySelector('meta[name="description"]').content,
    canonical: document.querySelector('link[rel="canonical"]').href,
    socialURL: document.querySelector('meta[property="og:url"]').content,
    socialLocale: document.querySelector('meta[property="og:locale"]').content,
    schema: [...document.querySelectorAll('script[type="application/ld+json"]')].map(node => JSON.parse(node.textContent))
}));
const persisted = page => page.evaluate(() => ({
    active: localStorage.getItem(EVState.STORAGE_KEY),
    backups: localStorage.getItem(EVBackups.STORAGE_KEY)
}));
async function context(options = {}) {
    const value = await browser.newContext({ locale: 'fr-FR', viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', ...options });
    await value.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === origin) return route.continue();
        externalRequests.push(url.origin + url.pathname);
        return route.abort();
    });
    value.on('page', page => {
        page.on('pageerror', error => failures.push(error.message));
        page.on('response', response => {
            const url = new URL(response.url());
            if (url.origin === origin && response.status() >= 400) missingAssets.push(response.status() + ' ' + url.pathname);
        });
    });
    return value;
}
async function localImages(page) {
    const images = await page.locator('img[src]').evaluateAll(nodes => nodes.filter(node => node.getAttribute('src')).map(node => ({
        loaded: node.complete && node.naturalWidth > 0,
        url: node.currentSrc || node.src
    })));
    assert.ok(images.length > 0);
    assert.ok(images.every(image => image.loaded), 'All visible and generated local logos load');
    assert.ok(images.every(image => /^(?:data:|blob:)/.test(image.url) || new URL(image.url).origin === origin), 'Logos remain local');
}

(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({ headless: true, channel: 'chromium' });
    for (const language of languages) {
        const disabled = await context({ javaScriptEnabled: false, locale: language === 'fr' ? 'en-US' : 'fr-FR' });
        const sourcePage = await disabled.newPage();
        const initialMetadata = {};
        for (const guide of [false, true]) {
            const suffix = language + '/' + (guide ? 'aide.html' : '');
            await sourcePage.goto(origin + '/EvPortal/' + suffix, { waitUntil: 'networkidle' });
            initialMetadata[guide] = await metadata(sourcePage);
            assert.equal(await sourcePage.locator('html').getAttribute('lang'), language);
            assert.equal(initialMetadata[guide].canonical, PUBLIC + suffix);
            assert.equal(initialMetadata[guide].socialURL, PUBLIC + suffix);
            if (guide) {
                assert.equal(await sourcePage.locator('nav.seo-languages a').count(), 8);
                assert.equal(await sourcePage.locator('h1').textContent(), dictionaries[language]['help.heading']);
                assert.equal(await sourcePage.locator('[data-i18n="help.storage"]').textContent(), dictionaries[language]['help.storage']);
                assert.ok((await sourcePage.locator('main').innerText()).length > 1500, 'Substantial help is readable with JavaScript disabled');
            } else {
                assert.ok(initialMetadata[guide].description.length > 60);
            }
        }
        await disabled.close();
        const enabled = await context({ locale: language === 'fr' ? 'en-US' : 'fr-FR', viewport: { width: language === 'ar' ? 390 : 1440, height: 1000 } });
        await enabled.addInitScript(() => {
            if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
            if (!localStorage.getItem('seo.locale-fixture')) {
                localStorage.setItem('evportal.language.v1', 'it');
                localStorage.setItem('seo.locale-fixture', 'set');
            }
        });
        const page = await enabled.newPage();
        for (const guide of [false, true]) {
            await page.goto(origin + '/EvPortal/' + language + '/' + (guide ? 'aide.html' : ''), { waitUntil: 'networkidle' });
            assert.equal(await page.evaluate(() => EVI18n.language), language, 'URL language overrides stored and browser languages');
            assert.equal(await page.locator('html').getAttribute('dir'), language === 'ar' ? 'rtl' : 'ltr');
            assert.deepEqual(await metadata(page), initialMetadata[guide], 'Metadata and structured data remain identical before and after JavaScript');
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow');
            if (!guide) {
                await page.locator('#content .shortcut').first().waitFor();
                await localImages(page);
                await page.locator('#settingsButton').click();
                const help = page.locator('.settings-help');
                assert.equal(new URL(await help.getAttribute('href'), page.url()).pathname, '/EvPortal/' + language + '/aide.html');
                await help.click();
                await page.waitForURL(origin + '/EvPortal/' + language + '/aide.html');
            }
        }
        await enabled.close();
        console.log('✓ ' + language + ': translated HTML without JavaScript, stable metadata, language priority, local assets and linked guide');
    }

    const navigationContext = await context();
    const page = await navigationContext.newPage();
    await page.goto(origin + '/EvPortal/de/', { waitUntil: 'networkidle' });
    await page.evaluate(() => {
        const state = EVState.normalizeState({ version: 2, theme: 'dark', activeCategory: 'seo-fixture', categories: [{
            id: 'seo-fixture', label: 'Persönlich', icon: 'music', shortcuts: [{ id: 'seo-link', name: 'Mein Radio', url: 'https://example.org/seo', favorite: true, clickCount: 12 }]
        }] });
        localStorage.setItem(EVState.STORAGE_KEY, JSON.stringify(state));
        EVBackups.createLibrary().add({ title: 'Sauvegarde de test SEO', state, source: 'created' });
    });
    await page.reload({ waitUntil: 'networkidle' });
    const before = await persisted(page);
    await page.locator('#settingsButton').click();
    await page.evaluate(() => history.replaceState(null, '', location.pathname + '?code=SEO-Private-Sentinel-09-12#settings'));
    await page.locator('#languageSelect').selectOption('fr');
    await page.waitForURL(origin + '/EvPortal/fr/?code=SEO-Private-Sentinel-09-12#settings');
    await page.waitForLoadState('networkidle');
    assert.equal(await page.evaluate(() => EVI18n.language), 'fr');
    assert.deepEqual(await persisted(page), before, 'Language navigation preserves the active configuration and local backup library exactly');
    assert.match(await page.locator('meta[name="robots"]').getAttribute('content'), /noindex/);
    assert.doesNotMatch(JSON.stringify(await metadata(page)), /SEO-Private-Sentinel|code=|#settings/);
    assert.equal(await page.locator('#importDialog').isVisible(), true, 'Incoming backup is proposed without being fetched or applied');
    assert.equal(await page.locator('#importConfigID').inputValue(), 'SEO-Private-Sentinel-09-12');
    await navigationContext.close();
    console.log('✓ Explicit language navigation preserves query, ordinary fragment, active shortcuts and saved backups; import metadata contains no backup value');

    const policyContext = await context();
    const policy = await policyContext.newPage();
    for (const parameter of ['code', 'config']) {
        await policy.goto(origin + '/EvPortal/?' + parameter + '=SEO-Private-Sentinel-09-12', { waitUntil: 'networkidle' });
        assert.match(await policy.locator('meta[name="robots"]').getAttribute('content'), /noindex/);
        assert.equal(await policy.locator('#importDialog').isVisible(), true);
        assert.doesNotMatch(JSON.stringify(await metadata(policy)), /SEO-Private-Sentinel|code=|config=/);
    }
    for (const mode of ['receive', 'download']) {
        await policy.goto(origin + '/EvPortal/ar/#' + mode + '=invalid-test-credentials', { waitUntil: 'networkidle' });
        assert.doesNotMatch(await policy.locator('meta[name="robots"]').getAttribute('content'), /noindex/, 'QR fragments do not change the indexability of the canonical app');
        assert.equal(new URL(policy.url()).hash, '', 'Invalid transfer fragments are consumed without a network transfer');
        assert.doesNotMatch(JSON.stringify(await metadata(policy)), /invalid-test-credentials|receive=|download=/);
    }
    // A subdirectory deployment and the root dev deployment both resolve real language directories.
    await policy.goto(origin + '/de/', { waitUntil: 'networkidle' });
    assert.equal(await policy.evaluate(() => EVI18n.language), 'de');
    await localImages(policy);
    await policy.goto(origin + '/ar/aide.html', { waitUntil: 'networkidle' });
    assert.equal(await policy.locator('h1').textContent(), dictionaries.ar['help.heading']);
    await policyContext.close();
    assert.deepEqual(failures, [], 'No JavaScript errors');
    assert.deepEqual(missingAssets, [], 'No missing local assets or language routes');
    assert.deepEqual(externalRequests, [], 'No third-party requests, telemetry, automatic import or relay calls on startup');
    console.log('✓ Legacy import URLs are noindex; QR fragments retain the public-page policy; root and GitHub project routes load without third-party requests or errors');
})().catch(error => {
    console.error(String(error.message || error).replace(/#(?:receive|download)=[^\s"'<>]+/g, '#transfer=[redacted]'));
    process.exitCode = 1;
}).finally(async () => {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
});
