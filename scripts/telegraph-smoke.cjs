/* Browser checks against the actual app. All Telegra.ph calls are intercepted; nothing is published. */
'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const Core = require('../js/state.js');

const root = path.resolve(__dirname, '..');
const token = 'mock-account-token-'.repeat(3);
const legacyTitle = 'Ancienne sauvegarde de mes trajets et voyages '.repeat(5);
const initialState = Core.normalizeState({ version: 2, activeCategory: 'all', theme: 'dark', categories: [
    { id: 'personal', label: 'Personnel', shortcuts: [{ id: 'my-shortcut', name: 'Mes trajets', url: 'https://example.com/trips', favorite: true, clickCount: 7, categoryIds: ['personal', 'travel'] }] },
    { id: 'travel', label: 'Voyages', shortcuts: [] }
] });
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
    const errors = [], unexpectedRequests = [], calls = [], deleted = new Set();
    let copied = '', publishedContent, publishedPath, failDeletion = true, releasePublication;
    let deferPublishedRead = false, releasePublishedRead;
    const publicationRelease = new Promise(resolve => { releasePublication = resolve; });
    const publishedReadRelease = new Promise(resolve => { releasePublishedRead = resolve; });
    try {
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const origin = 'http://127.0.0.1:' + server.address().port;
        const appURL = origin + '/EvPortal/';
        const publicURL = 'https://drslid.github.io/EvPortal/';
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', locale: 'fr-FR' });
        await context.addInitScript(({ mockToken, state }) => {
            if (!localStorage.getItem('config')) localStorage.setItem('config', JSON.stringify({ accesstoken: mockToken, randomID: 'old-account' }));
            if (!localStorage.getItem('evportal.state.v2')) localStorage.setItem('evportal.state.v2', JSON.stringify(state));
        }, { mockToken: token, state: initialState });
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
                    await publicationRelease;
                    return route.fulfill({ json: { ok: true, result: { path: publishedPath } } });
                }
                if (url.pathname === '/editPage') {
                    if (parameters.title === 'Deleted Page') {
                        assert.ok(['Old-09-09', publishedPath].includes(parameters.path));
                        assert.deepEqual(JSON.parse(parameters.content), [{ tag: 'p', children: ['EvPortal backup removed.'] }]);
                        assert.equal(parameters.author_name, '');
                        assert.equal(parameters.author_url, '');
                        assert.equal(parameters.access_token, token);
                        if (failDeletion) return route.fulfill({ json: { ok: false, error: 'ACCESS_TOKEN_INVALID' } });
                        deleted.add(parameters.path);
                        return route.fulfill({ json: { ok: true, result: { path: parameters.path, title: 'Deleted Page', content: [{ tag: 'p', children: ['EvPortal backup removed.'] }], author_name: '', author_url: '' } } });
                    }
                    assert.equal(parameters.path, publishedPath);
                    assert.equal(parameters.title, 'Mes raccourcis EvPortal');
                    publishedContent = JSON.parse(parameters.content);
                    return route.fulfill({ json: { ok: true, result: { path: publishedPath } } });
                }
                if (url.pathname === '/getPageList') return route.fulfill({ json: { ok: true, result: { total_count: 2, pages: [
                    { path: 'Old-09-09', title: deleted.has('Old-09-09') ? 'Deleted Page' : '<img src=x onerror=alert(1)>' },
                    { path: publishedPath, title: deleted.has(publishedPath) ? 'Deleted Page' : 'Mes raccourcis EvPortal' }
                ] } } });
                if (url.pathname === '/getPage/' + publishedPath || url.pathname === '/getPage/Old-09-09') {
                    if (url.pathname === '/getPage/' + publishedPath && deferPublishedRead) await publishedReadRelease;
                    return route.fulfill({ json: { ok: true, result: { title: legacyTitle, content: publishedContent } } });
                }
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
        await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: value => window.testCopyShare(value) } }));
        const activeState = () => page.evaluate(() => JSON.parse(localStorage.getItem(EVState.STORAGE_KEY)));
        const localBackups = () => page.evaluate(() => EVBackups.createLibrary(localStorage).list());
        const startingState = await activeState();
        assert.equal(calls.length, 0);
        await page.locator('#settingsButton').click();
        await page.locator('#shareButton').click();
        assert.equal(calls.length, 0, 'Opening Create makes no account or history request');
        assert.equal(await page.locator('#shareBaseURL, #shareQRCode, #shareHistory').count(), 0, 'Creation has code/link fields and no QR or duplicate library');
        assert.equal(await page.locator('#shareCode').getAttribute('readonly'), '');
        assert.equal(await page.locator('#shareLink').getAttribute('readonly'), '');
        assert.equal(await page.locator('#shareNameOptions').getAttribute('open'), null);
        assert.equal(await page.locator('#shareTitle').getAttribute('required'), null);
        const reservation = page.waitForRequest(request => request.url() === 'https://api.telegra.ph/createPage');
        await page.evaluate(() => { document.getElementById('shareTitle').value = ''; const form = document.getElementById('shareForm'); form.requestSubmit(); form.requestSubmit(); });
        await reservation;
        assert.equal(await page.locator('#sharePublishButton').isDisabled(), true);
        await page.evaluate(() => EVI18n.setLanguage('ar'));
        assert.equal(await page.locator('#sharePublishButton span').textContent(), await page.evaluate(() => EVI18n.t('share.publishing')));
        assert.ok(await page.locator('#sharePublishButton svg').count() > 0, 'Publication preserves its illustration');
        await page.evaluate(() => EVI18n.setLanguage('fr'));
        const changedState = await page.evaluate(() => {
            const oldValue = localStorage.getItem(EVState.STORAGE_KEY);
            const state = EVState.normalizeState(JSON.parse(oldValue));
            state.categories[0].shortcuts[0].name = 'Modification dans un autre onglet';
            state.categories[0].shortcuts[0].clickCount += 5;
            const newValue = JSON.stringify(state);
            localStorage.setItem(EVState.STORAGE_KEY, newValue);
            dispatchEvent(new StorageEvent('storage', { key: EVState.STORAGE_KEY, oldValue, newValue, storageArea: localStorage }));
            return state;
        });
        releasePublication();
        await page.locator('#shareResult').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#sharePublishButton').isEnabled(), true);
        assert.equal(calls.filter(call => call.url.endsWith('/createPage')).length, 1);
        assert.equal(calls.filter(call => call.url.endsWith('/editPage')).length, 1, 'A double submit creates a single backup');
        assert.deepEqual(JSON.parse(publishedContent[0].children[0]), startingState, 'Publication keeps the snapshot taken before its first network wait');
        assert.equal(JSON.stringify(publishedContent).includes(token), false);
        assert.deepEqual(await activeState(), changedState, 'Creating a remote backup never restores it');
        assert.deepEqual(await localBackups(), [], 'Creation does not duplicate the online page in the local library');
        const expectedURL = publicURL + '?code=' + publishedPath;
        assert.equal(await page.locator('#shareCode').inputValue(), publishedPath);
        assert.equal(await page.locator('#shareLink').inputValue(), expectedURL);
        await page.locator('#shareCopyCodeButton').click();
        assert.equal(copied, publishedPath);
        await page.locator('#shareCopyButton').click();
        assert.equal(copied, expectedURL, 'Link copy points to the public portal');
        assert.equal((await page.locator('body').textContent()).includes(token), false);
        await page.setViewportSize({ width: 390, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        assert.equal(await page.locator('#shareDialog').evaluate(dialog => dialog.scrollWidth > dialog.clientWidth), false);
        await page.setViewportSize({ width: 1280, height: 900 });
        console.log('✓ Création sans QR, code/lien copiables, snapshot stable, double clic neutralisé et bibliothèque locale inchangée');

        await page.locator('#shareDialog [data-close-dialog]').click();
        await page.locator('#settingsButton').click();
        await page.locator('#importConfigButton').click();
        await page.locator('#importConfigID').fill(expectedURL);
        await page.locator('#telegraphImportForm').evaluate(form => form.requestSubmit());
        await page.locator('#restoreDialog').waitFor({ state: 'visible' });
        await page.locator('#confirmRestoreButton').waitFor({ state: 'visible' });
        assert.equal(calls.some(call => call.url === 'https://api.telegra.ph/getPage/' + publishedPath + '?return_content=true'), true);
        assert.deepEqual(await activeState(), changedState, 'Adding a link only saves it in the local library');
        const saved = await localBackups();
        assert.equal(saved.length, 1);
        assert.equal(saved[0].path, publishedPath);
        const titleLimit = await page.evaluate(() => EVBackups.MAX_TITLE_LENGTH);
        assert.ok(legacyTitle.length > titleLimit && legacyTitle.length <= 256);
        assert.equal(saved[0].title, legacyTitle.slice(0, titleLimit).trim(), 'An older long title is shortened without rejecting its backup');
        assert.deepEqual(saved[0].state, startingState);
        await page.locator('#confirmRestoreButton').click();
        await page.locator('#restoreDialog').waitFor({ state: 'hidden' });
        assert.deepEqual(await activeState(), startingState, 'Only explicit Restore replaces active shortcuts');
        assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('evportal.previous-transfer.v1'))), changedState);
        console.log('✓ Ajouter accepte un ancien titre long sans changer les raccourcis ; Restaurer préserve la copie d’annulation');

        await page.locator('#settingsButton').click();
        await page.locator('#restoreBackupButton').click();
        await page.waitForFunction(() => document.querySelectorAll('#onlineBackupList .backup-row').length === 2);
        assert.equal(await page.locator('#onlineBackupList a, #onlineBackupList img').count(), 0, 'Remote titles remain literal text');
        const oldRow = page.locator('#onlineBackupList .backup-row').filter({ has: page.locator('.backup-select[data-backup-key="Old-09-09"]') });
        assert.equal(await oldRow.locator('.backup-select strong').textContent(), '<img src=x onerror=alert(1)>');
        await oldRow.locator('.backup-select').click();
        await page.locator('#confirmRestoreButton').waitFor({ state: 'visible' });
        assert.deepEqual(await activeState(), startingState, 'Selecting an online backup only previews it');
        await page.evaluate(() => EVI18n.setLanguage('de'));
        assert.equal(await oldRow.locator('.backup-delete').getAttribute('aria-label'), await page.evaluate(() => EVI18n.t('backup.deleteNamed', { name: '<img src=x onerror=alert(1)>' })));
        await page.evaluate(() => EVI18n.setLanguage('fr'));
        await oldRow.locator('.backup-delete').click();
        await page.waitForFunction(() => document.getElementById('restoreError').textContent.length > 0);
        assert.equal(await oldRow.count(), 1, 'A refused deletion preserves the row');
        assert.equal(await oldRow.locator('.backup-delete').isEnabled(), true);
        assert.equal(await page.locator('#shareCode').inputValue(), publishedPath);
        failDeletion = false;
        const publishedRow = page.locator('#onlineBackupList .backup-row').filter({ has: page.locator('.backup-select[data-backup-key="' + publishedPath + '"]') });
        deferPublishedRead = true;
        const pendingRead = page.waitForRequest(request => request.url() === 'https://api.telegra.ph/getPage/' + publishedPath + '?return_content=true');
        await publishedRow.locator('.backup-select').click();
        await pendingRead;
        assert.equal(await page.locator('#restorePreview').isVisible(), false, 'Selecting B waits for its delayed response');
        await oldRow.locator('.backup-delete').click();
        await oldRow.waitFor({ state: 'detached' });
        assert.equal(await page.locator('#restorePreview').isVisible(), false, 'Deleting A does not display an incomplete B preview');
        assert.equal(await page.locator('#shareCode').inputValue(), publishedPath, 'Deleting another backup keeps the published result');
        releasePublishedRead();
        await page.locator('#restorePreview').waitFor({ state: 'visible' });
        assert.equal(await publishedRow.locator('.backup-select').getAttribute('aria-pressed'), 'true', 'Deleting A must leave the pending selection of B able to finish');
        assert.equal(await page.locator('#restoreError').textContent(), '');
        assert.equal(await page.locator('#restoreName').textContent(), legacyTitle.slice(0, titleLimit).trim());
        assert.deepEqual(await activeState(), startingState);
        console.log('✓ Une sélection distante différée termine après la suppression d’une autre sauvegarde');
        await publishedRow.locator('.backup-delete').click();
        await publishedRow.waitFor({ state: 'detached' });
        assert.equal(await page.locator('#restorePreview').isVisible(), false, 'Deleting the selected page clears its restoration preview');
        assert.equal(await page.locator('#shareCode').inputValue(), '', 'Deletion clears the matching copyable result');
        assert.equal(await page.locator('#shareLink').inputValue(), '');
        assert.equal(await page.locator('#shareResult').getAttribute('hidden'), '');
        assert.equal((await localBackups()).length, 1, 'Deleting the online page preserves its existing local copy');
        assert.deepEqual(await activeState(), startingState);
        assert.deepEqual(dialogs, [], 'Deletion does not ask for confirmation');
        assert.equal(calls.some(call => call.url.endsWith('/createAccount')), false);
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('config')).accesstoken), token);
        assert.deepEqual(errors, []);
        assert.deepEqual(unexpectedRequests, []);
        console.log('✓ Bibliothèque unique, titres sûrs, suppression sans confirmation, échec récupérable, code/lien effacés sans perdre la copie locale');
    } finally {
        releasePublication();
        releasePublishedRead();
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
