/* Notify public, already deployed EvPortal pages. No app data or account token. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { releaseFingerprint } from './seo-release.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const endpoint = 'https://api.indexnow.org/indexnow';
const languages = ['en', 'fr', 'es', 'de', 'it', 'ru', 'ar', 'pt'];
const digest = value => createHash('sha256').update(value).digest('hex');

export function notificationPlan(root = projectRoot) {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'seo.config.json'), 'utf8'));
    const base = new URL(config.baseURL);
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || !base.pathname.endsWith('/')) {
        throw new Error('Invalid public base URL.');
    }
    const keyFile = config.indexNow && config.indexNow.keyFile;
    if (typeof keyFile !== 'string' || !/^indexnow-[a-f0-9]{32}\.txt$/.test(keyFile)) throw new Error('An IndexNow key file is required at the project root.');
    const key = fs.readFileSync(path.join(root, keyFile), 'utf8').trim();
    if (!/^[a-f0-9]{32}$/.test(key) || keyFile !== 'indexnow-' + key + '.txt') throw new Error('Invalid IndexNow ownership file.');
    const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'));
    const urls = [...sitemap.toString('utf8').matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map(match => match[1].replace(/&amp;/g, '&'));
    const publicPages = new Map();
    for (const language of ['', ...languages]) for (const guide of [false, true]) {
        const relative = (language ? language + '/' : '') + (guide ? 'aide.html' : '');
        const url = new URL(relative, base).href;
        publicPages.set(url, relative + (guide ? '' : 'index.html'));
    }
    if (urls.length !== publicPages.size || new Set(urls).size !== urls.length || urls.some(url => !publicPages.has(url))) {
        throw new Error('The sitemap must contain only the 18 public portal and guide URLs, without queries or fragments.');
    }
    const release = fs.readFileSync(path.join(root, 'seo-release.json'));
    const releaseInfo = JSON.parse(release);
    if (releaseInfo.version !== 1 || !/^[a-f0-9]{64}$/.test(releaseInfo.fingerprint)) throw new Error('Rebuild the SEO release fingerprint before notifying search engines.');
    const pageFiles = new Map([...publicPages.values()].map(file => [file, fs.readFileSync(path.join(root, file))]));
    pageFiles.set('sitemap.xml', sitemap);
    pageFiles.set('robots.txt', fs.readFileSync(path.join(root, 'robots.txt')));
    if (releaseFingerprint(root, pageFiles) !== releaseInfo.fingerprint) throw new Error('Public files changed after generation. Rebuild SEO before notification.');
    return {
        endpoint,
        payload: { host: base.host, key, keyLocation: new URL(keyFile, base).href, urlList: urls },
        release: { url: new URL('seo-release.json', base).href, hash: digest(release) },
        files: [{ url: new URL('sitemap.xml', base).href, hash: digest(sitemap) }, ...urls.map(url => ({
            url, hash: digest(fs.readFileSync(path.join(root, publicPages.get(url))))
        }))]
    };
}

function pending(message) {
    const error = new Error(message);
    error.code = 'NOT_DEPLOYED';
    return error;
}

export async function checkPublished(plan, fetcher = fetch) {
    async function get(url) {
        let response;
        try {
            response = await fetcher(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8000) });
        } catch (_) { throw pending('The public release cannot be checked yet.'); }
        if (response.status !== 200) throw pending('The public release is not fully available yet.');
        const body = Buffer.from(await response.arrayBuffer());
        if (body.length > 2 * 1024 * 1024) throw new Error('Unexpectedly large public page response.');
        return body;
    }
    // Checking the release first avoids scanning old pages while Pages deploys.
    if (digest(await get(plan.release.url)) !== plan.release.hash) throw pending('The expected public release is not served yet.');
    const key = (await get(plan.payload.keyLocation)).toString('utf8').trim();
    if (key !== plan.payload.key) throw pending('The expected ownership file is not served yet.');
    let position = 0;
    await Promise.all(Array.from({ length: 6 }, async () => {
        while (position < plan.files.length) {
            const file = plan.files[position++];
            if (digest(await get(file.url)) !== file.hash) throw pending('Published pages differ from this release. No notification was sent.');
        }
    }));
    return true;
}

export async function submitNotification(plan, fetcher = fetch) {
    await checkPublished(plan, fetcher);
    const response = await fetcher(endpoint, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(plan.payload)
    });
    if (![200, 202].includes(response.status)) throw new Error('IndexNow rejected the notification (HTTP ' + response.status + ').');
    return { status: response.status, count: plan.payload.urlList.length, ownershipPending: response.status === 202 };
}

async function main() {
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== '--submit' && !/^--wait=\d+$/.test(arg))) throw new Error('Usage: node scripts/notify-indexnow.mjs [--submit] [--wait=300]');
    const plan = notificationPlan();
    if (!args.includes('--submit')) {
        console.log('Dry run: ' + plan.payload.urlList.length + ' public URLs ready. No request sent. Use --submit after publication.');
        return;
    }
    const wait = Math.min(Number((args.find(arg => arg.startsWith('--wait=')) || '--wait=0').slice(7)), 600);
    const deadline = Date.now() + wait * 1000;
    while (true) {
        try {
            const result = await submitNotification(plan);
            console.log('IndexNow received ' + result.count + ' public URLs (HTTP ' + result.status + ').'
                + (result.ownershipPending ? ' Ownership verification is pending.' : '') + ' This does not confirm indexing.');
            return;
        } catch (error) {
            if (error.code !== 'NOT_DEPLOYED' || Date.now() >= deadline) throw error;
            console.log('Waiting for the matching public release; no notification sent.');
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
