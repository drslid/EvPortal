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
    const errors = [], unexpectedRequests = [], calls = [];
    let copied = '', publishedContent, publishedPath, failDeletion = true, deleted = false;
    let pageRequestStarted, releasePublication;
    const publicationStarted = new Promise(resolve => { pageRequestStarted = resolve; });
    const publicationRelease = new Promise(resolve => { releasePublication = resolve; });
    try {
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const origin = 'http://127.0.0.1:' + server.address().port;
        const appURL = origin + '/EvPortal/';
        const publicURL = 'https://drslid.github.io/EvPortal/';
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', locale: 'fr-FR' });
        await context.addInitScript(mockToken => {
            if (!localStorage.getItem('config')) localStorage.setItem('config', JSON.stringify({ accesstoken: mockToken, randomID: 'old-account' }));
        }, token);
        await context.route('**/*', async route => {
            const request = route.request(), url = new URL(request.url());
            if (url.origin === origin) return route.continue();
            if (url.origin === 'https://api.telegra.ph') {
                const parameters = Object.fromEntries(new URLSearchParams(request.postData() || ''));
                calls.push({ url: url.href, parameters });
                if (url.pathname === '/createPage') {
                    assert.match(parameters.title, /^EVP-[a-f0-9]{32}$/);
                    assert.deepEqual(JSON.parse(parameters.content), [{ tag: 'p', children: ['EvPortal'] }]);
                    publishedPath = parameters.title + '-09-11';
                    return route.fulfill({ json: { ok: true, result: { path: publishedPath } } });
                }
                if (url.pathname === '/editPage') {
                    if (parameters.title === 'Deleted Page') {
                        assert.equal(parameters.path, 'Old-09-09');
                        assert.deepEqual(JSON.parse(parameters.content), [{ tag: 'p', children: ['EvPortal backup removed.'] }]);
                        assert.equal(parameters.author_name, '');
                        assert.equal(parameters.author_url, '');
                        assert.equal(parameters.access_token, token);
                        if (failDeletion) return route.fulfill({ json: { ok: false, error: 'ACCESS_TOKEN_INVALID' } });
                        deleted = true;
                        return route.fulfill({ json: { ok: true, result: { path: parameters.path, title: 'Deleted Page', content: [{ tag: 'p', children: ['EvPortal backup removed.'] }], author_name: '', author_url: '' } } });
                    }
                    assert.equal(parameters.path, publishedPath);
                    assert.equal(parameters.title, 'Mes raccourcis EvPortal');
                    publishedContent = JSON.parse(parameters.content);
                    pageRequestStarted();
                    await publicationRelease;
                    return route.fulfill({ json: { ok: true, result: { path: publishedPath } } });
                }
                if (url.pathname === '/getPageList') return route.fulfill({ json: { ok: true, result: { total_count: 2, pages: [
                    { path: 'Old-09-09', title: deleted ? 'Deleted Page' : '<img src=x onerror=alert(1)>' },
                    { path: publishedPath, title: 'Mes raccourcis EvPortal' }
                ] } } });
                if (url.pathname === '/getPage/' + publishedPath) return route.fulfill({ json: { ok: true, result: { content: publishedContent } } });
            }
            unexpectedRequests.push(url.href);
            return route.abort();
        });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        const dialogs = [];
        page.on('dialog', async dialog => { dialogs.push(dialog.type()); await dialog.dismiss(); });
        await page.exposeFunction('testCopyShare', value => { copied = value; });
        await page.goto(appURL, { waitUntil: 'networkidle' });
        await page.addScriptTag({ path: require.resolve('jsqr') });
        await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: value => window.testCopyShare(value) } }));
        assert.equal(calls.length, 0);
        await page.locator('#settingsButton').click();
        await page.locator('#shareButton').click();
        assert.equal(calls.length, 0, 'Opening Share makes no account or history request');
        assert.equal(await page.locator('#shareBaseURL, #shareCode, #shareCopyCodeButton, #shareLink').count(), 0, 'No address, manual code or long link is shown');
        assert.equal(await page.locator('#shareNameOptions').getAttribute('open'), null);
        assert.equal(await page.locator('#shareTitle').getAttribute('required'), null);
        await page.evaluate(() => { document.getElementById('shareTitle').value = ''; const form = document.getElementById('shareForm'); form.requestSubmit(); form.requestSubmit(); });
        await publicationStarted;
        assert.equal(await page.locator('#sharePublishButton').isDisabled(), true);
        assert.equal(calls.length, 2, 'One reservation and one write despite a double submit');
        await page.evaluate(() => EVI18n.setLanguage('ar'));
        assert.equal(await page.locator('#sharePublishButton span').textContent(), await page.evaluate(() => EVI18n.t('share.publishing')));
        assert.ok(await page.locator('#sharePublishButton svg').count() > 0, 'Publication preserves its illustration');
        await page.evaluate(() => EVI18n.setLanguage('fr'));
        releasePublication();
        await page.locator('#shareResult').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#sharePublishButton').isEnabled(), true);
        assert.equal(JSON.parse(publishedContent[0].children[0]).version, 2);
        assert.equal(JSON.stringify(publishedContent).includes(token), false);
        const expectedURL = publicURL + '?code=' + publishedPath;
        async function decodeQR() {
            return page.evaluate(() => {
                const source = document.querySelector('#shareQRCode canvas');
                const canvas = document.createElement('canvas');
                canvas.width = source.width + 32; canvas.height = source.height + 32;
                const drawing = canvas.getContext('2d');
                drawing.fillStyle = '#fff'; drawing.fillRect(0, 0, canvas.width, canvas.height); drawing.drawImage(source, 16, 16);
                const pixels = drawing.getImageData(0, 0, canvas.width, canvas.height);
                return window.jsQR(pixels.data, pixels.width, pixels.height)?.data;
            });
        }
        assert.equal(await decodeQR(), expectedURL);
        await page.locator('#shareCopyButton').click();
        assert.equal(copied, expectedURL, 'QR and copy always point to the fixed public portal');
        assert.equal((await page.locator('body').textContent()).includes(token), false);
        assert.ok(await page.locator('#sharePublishButton svg').count() > 0);
        console.log('✓ Sauvegarde simplifiée, nom facultatif, URL publique fixe, double clic neutralisé et QR décodé = lien copié');

        await page.setViewportSize({ width: 390, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.equal(await page.locator('#shareDialog').evaluate(dialog => dialog.scrollWidth > dialog.clientWidth), false);
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.locator('#shareHistory summary').click();
        await page.waitForFunction(() => document.querySelectorAll('.share-history-row').length === 2);
        assert.equal(calls.length, 3, 'Opening My backups loads history directly');
        assert.equal(await page.locator('.share-history-row a').count(), 0);
        assert.equal(await page.locator('.share-history-row img').count(), 0);
        const row = page.locator('.share-history-row').filter({ has: page.getByRole('button', { name: '<img src=x onerror=alert(1)>', exact: true }) });
        await row.locator('button').first().click();
        assert.equal(await decodeQR(), publicURL + '?code=Old-09-09');
        await page.evaluate(() => EVI18n.setLanguage('de'));
        assert.equal(await row.locator('.share-delete').getAttribute('aria-label'), await page.evaluate(() => EVI18n.t('share.deleteNamed', { name: '<img src=x onerror=alert(1)>' })));
        await page.evaluate(() => EVI18n.setLanguage('fr'));
        await row.locator('.share-delete').click();
        await page.waitForFunction(() => document.getElementById('shareError').textContent.length > 0);
        assert.equal(await row.count(), 1, 'A refused deletion preserves the row');
        assert.equal(await page.locator('#shareResult').isVisible(), true);
        assert.equal(await row.locator('.share-delete').isEnabled(), true);
        failDeletion = false;
        await row.locator('.share-delete').click();
        await row.waitFor({ state: 'detached' });
        assert.equal(await page.locator('#shareResult').isVisible(), false, 'Deleting the selected backup clears its QR');
        assert.equal(await page.locator('#shareQRCode canvas').count(), 0);
        assert.deepEqual(dialogs, [], 'Deletion does not ask for confirmation');
        assert.equal(calls.some(call => call.url.endsWith('/createAccount')), false);
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('config')).accesstoken), token);
        console.log('✓ Historique automatique, suppression sans confirmation, échec récupérable, contenu/auteurs effacés et QR retiré');

        await page.locator('#shareDialog [data-close-dialog]').click();
        await page.locator('#settingsButton').click();
        await page.locator('#importConfigButton').click();
        assert.equal(await page.locator('#savedBackupPicker').isVisible(), true);
        assert.equal(await page.locator('#importConfigID').isVisible(), false);
        await page.locator('#legacyImportOptions > summary').click();
        await page.locator('#importConfigID').fill(expectedURL);
        const before = await page.evaluate(() => localStorage.getItem(EVState.STORAGE_KEY));
        await page.locator('#telegraphImportForm').evaluate(form => form.requestSubmit());
        await page.locator('#confirmImportButton').waitFor({ state: 'visible' });
        assert.equal(calls.at(-1).url, 'https://api.telegra.ph/getPage/' + publishedPath + '?return_content=true');
        assert.equal(await page.evaluate(() => localStorage.getItem(EVState.STORAGE_KEY)), before);
        await page.locator('#confirmImportButton').click();
        assert.equal(await page.locator('#importDialog').isVisible(), false);
        assert.deepEqual(errors, []);
        assert.deepEqual(unexpectedRequests, []);
        console.log('✓ Restauration manuelle du lien copié préservée dans les options, aperçu avant remplacement, aucune requête externe réelle');
    } finally {
        releasePublication();
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
