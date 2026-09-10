/* Browser checks against the actual app. All Telegra.ph calls are intercepted; nothing is published. */
'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const token = 'mock-account-token-'.repeat(3);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const server = http.createServer(async (req, res) => {
    try {
        const requestPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const relative = requestPath.replace(/^\/EvPortal\//, '').replace(/^\//, '') || 'index.html';
        const filename = path.resolve(root, relative);
        if (!filename.startsWith(root + path.sep)) throw new Error('Invalid path');
        const content = await fs.readFile(filename);
        res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream' });
        res.end(content);
    } catch (_) { res.writeHead(404); res.end('Not found'); }
});

async function run() {
    let browser;
    const errors = [];
    const unexpectedRequests = [];
    const calls = [];
    let copied = '';
    let publishedContent;
    let pageRequestStarted;
    let releasePublication;
    const publicationStarted = new Promise(resolve => { pageRequestStarted = resolve; });
    const publicationRelease = new Promise(resolve => { releasePublication = resolve; });
    try {
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const origin = 'http://127.0.0.1:' + server.address().port;
        const appURL = origin + '/EvPortal/';
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', locale: 'fr-FR' });
        await context.addInitScript(mockToken => {
            if (!localStorage.getItem('config')) localStorage.setItem('config', JSON.stringify({ accesstoken: mockToken, randomID: 'old-account' }));
        }, token);
        await context.route('**/*', async route => {
            const request = route.request();
            const url = new URL(request.url());
            if (url.origin === origin) return route.continue();
            if (url.origin === 'https://api.telegra.ph') {
                const parameters = Object.fromEntries(new URLSearchParams(request.postData() || ''));
                calls.push({ url: url.href, parameters });
                if (url.pathname === '/createPage') {
                    publishedContent = JSON.parse(parameters.content);
                    pageRequestStarted();
                    await publicationRelease;
                    return route.fulfill({ json: { ok: true, result: { path: 'Phone-09-10' } } });
                }
                if (url.pathname === '/getPageList') {
                    return route.fulfill({ json: { ok: true, result: { total_count: 2, pages: [
                        { path: 'Old-09-09', title: '<img src=x onerror=alert(1)>' },
                        { path: 'Deleted-09-09', title: 'Deleted Page' }
                    ] } } });
                }
                if (['/getPage/Old-09-09', '/getPage/Phone-09-10'].includes(url.pathname)) {
                    return route.fulfill({ json: { ok: true, result: { content: publishedContent } } });
                }
            }
            unexpectedRequests.push(url.href);
            return route.abort();
        });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.exposeFunction('testCopyShare', value => { copied = value; });
        await page.goto(appURL, { waitUntil: 'networkidle' });
        await page.addScriptTag({ path: require.resolve('jsqr') });
        await page.evaluate(() => {
            Object.defineProperty(navigator, 'clipboard', { value: { writeText: value => window.testCopyShare(value) } });
        });
        assert.equal(calls.length, 0, 'No API requests on app startup');
        await page.locator('#shareButton').click();
        assert.equal(calls.length, 0, 'Opening Share does not publish or create an account');
        assert.equal(await page.locator('#sharePreviewNote').isVisible(), true);
        assert.match(await page.locator('#sharePreviewNote').textContent(), /version publiée/);
        assert.equal(await page.locator('#shareBaseURL').inputValue(), 'https://drslid.github.io/EvPortal/');
        await page.locator('#shareBaseURL').fill(appURL);
        await page.evaluate(() => {
            const form = document.getElementById('shareForm');
            form.requestSubmit();
            form.requestSubmit();
        });
        await publicationStarted;
        assert.equal(await page.locator('#sharePublishButton').isDisabled(), true);
        assert.equal(await page.locator('#shareResult').isVisible(), false);
        assert.equal(calls.length, 1, 'A double submit creates only one page');
        await page.evaluate(() => EVI18n.setLanguage('ar'));
        assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
        assert.equal(await page.locator('#sharePublishButton').textContent(), await page.evaluate(() => EVI18n.t('share.publishing')));
        assert.equal(await page.locator('#sharePublishButton').isDisabled(), true, 'Changing language must preserve the pending publication');
        assert.equal(calls.length, 1, 'Changing language does not publish again');
        await page.evaluate(() => EVI18n.setLanguage('fr'));
        releasePublication();
        await page.locator('#shareResult').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#sharePublishButton').isEnabled(), true);
        assert.equal(calls[0].parameters.access_token, token);
        assert.equal(calls[0].parameters.content.includes(token), false);
        assert.equal(JSON.parse(publishedContent[0].children[0]).version, 2);
        const expectedURL = appURL + '?code=Phone-09-10';
        assert.equal(await page.locator('#shareLink').getAttribute('href'), expectedURL);
        assert.equal(await page.locator('#shareCode').inputValue(), 'Phone-09-10');

        async function decodeQR() {
            return page.evaluate(() => {
                const source = document.querySelector('#shareQRCode canvas');
                const canvas = document.createElement('canvas');
                canvas.width = source.width + 32;
                canvas.height = source.height + 32;
                const drawing = canvas.getContext('2d');
                drawing.fillStyle = '#fff';
                drawing.fillRect(0, 0, canvas.width, canvas.height);
                drawing.drawImage(source, 16, 16);
                const pixels = drawing.getImageData(0, 0, canvas.width, canvas.height);
                return window.jsQR(pixels.data, pixels.width, pixels.height)?.data;
            });
        }

        assert.equal(await decodeQR(), expectedURL, 'The generated QR bitmap must decode to the displayed link');
        await page.locator('#shareCopyButton').click();
        assert.equal(copied, expectedURL, 'Copy and QR contain exactly the same link');
        await page.locator('#shareCopyCodeButton').click();
        assert.equal(copied, 'Phone-09-10', 'Tesla receives the public page ID without an account token');
        assert.equal((await page.locator('body').textContent()).includes(token), false);
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('config')).randomID), 'old-account');
        console.log('✓ Publication explicite, ancien compte conservé, double clic neutralisé, QR réellement décodé = lien copié');

        const lanBase = 'http://192.168.1.20:4188/EvPortal/';
        await page.locator('#shareBaseURL').fill(lanBase);
        assert.equal(await page.locator('#shareLink').getAttribute('href'), lanBase + '?code=Phone-09-10');
        assert.equal(await decodeQR(), lanBase + '?code=Phone-09-10');
        assert.equal(calls.length, 1, 'Editing the destination does not republish');
        await page.setViewportSize({ width: 390, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
        assert.equal(await page.locator('#shareDialog').evaluate(dialog => dialog.scrollWidth > dialog.clientWidth), false);
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.locator('#shareHistory summary').click();
        assert.equal(calls.length, 1, 'History requires an explicit request');
        await page.locator('#shareRefreshButton').click();
        await page.locator('.share-history-row').waitFor();
        assert.equal(calls.length, 2);
        assert.equal(await page.locator('.share-history-row').count(), 1);
        assert.equal(await page.locator('.share-history-row img').count(), 0);
        const importURL = appURL + '?code=Old-09-09';
        assert.equal(await page.locator('.share-history-row a').getAttribute('href'), importURL);
        await page.evaluate(() => EVI18n.setLanguage('de'));
        assert.equal(await page.locator('.share-history-row a').textContent(), await page.evaluate(() => EVI18n.t('share.import')));
        assert.equal(await page.locator('.share-history-row a').getAttribute('aria-label'), await page.evaluate(() => EVI18n.t('share.importNamed', { name: '<img src=x onerror=alert(1)>' })));
        assert.equal(await page.locator('.share-history-row button').textContent(), '<img src=x onerror=alert(1)>', 'User titles are not translated');
        assert.equal(calls.length, 2, 'History retranslation does not request pages again');
        await page.evaluate(() => EVI18n.setLanguage('fr'));
        await page.locator('.share-history-row button').click();
        assert.equal(await page.locator('#shareLink').getAttribute('href'), lanBase + '?code=Old-09-09');
        assert.equal(await decodeQR(), lanBase + '?code=Old-09-09');
        assert.equal(await page.locator('#shareCode').inputValue(), 'Old-09-09');
        console.log('✓ Destination téléphone modifiable, partage sans débordement à 390 px, historique explicite et noms affichés sans HTML');

        const beforeImport = await page.evaluate(() => localStorage.getItem(EVState.STORAGE_KEY));
        await page.locator('.share-history-row a').click();
        await page.waitForURL(importURL);
        await page.locator('#importDialog').waitFor({ state: 'visible' });
        assert.equal(await page.evaluate(() => localStorage.getItem(EVState.STORAGE_KEY)), beforeImport);
        if (!await page.locator('#confirmImportButton').isVisible()) await page.locator('#telegraphImportForm').evaluate(form => form.requestSubmit());
        await page.locator('#confirmImportButton').waitFor({ state: 'visible' });
        assert.equal(await page.evaluate(() => localStorage.getItem(EVState.STORAGE_KEY)), beforeImport, 'Preview does not replace existing tiles');
        await page.locator('#confirmImportButton').click();
        assert.equal(await page.locator('#importDialog').isVisible(), false);
        assert.equal(await page.evaluate(() => new URL(location.href).searchParams.has('code')), false);
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('config')).accesstoken), token);
        await page.locator('#settingsButton').click();
        await page.locator('#importConfigButton').click();
        await page.locator('#importConfigID').fill(expectedURL);
        const beforePastedLink = await page.evaluate(() => localStorage.getItem(EVState.STORAGE_KEY));
        await page.locator('#telegraphImportForm').evaluate(form => form.requestSubmit());
        await page.locator('#confirmImportButton').waitFor({ state: 'visible' });
        assert.equal(calls.at(-1).url, 'https://api.telegra.ph/getPage/Phone-09-10?return_content=true', 'Pasted EvPortal link only requests the matching Telegra.ph page');
        assert.equal(await page.evaluate(() => localStorage.getItem(EVState.STORAGE_KEY)), beforePastedLink, 'Pasting the copied link still requires confirmation');
        await page.locator('#confirmImportButton').click();
        assert.equal(await page.locator('#importDialog').isVisible(), false);
        assert.deepEqual(errors, []);
        assert.deepEqual(unexpectedRequests, [], 'No real external requests allowed');
        console.log('✓ Import du contenu publié via le lien historique ou le lien copié/collé, aperçu avant remplacement, compte conservé, zéro erreur JavaScript');
        console.log('Tests Telegra.ph/QR réussis. API simulée uniquement : aucune donnée publiée.');
    } finally {
        releasePublication();
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
