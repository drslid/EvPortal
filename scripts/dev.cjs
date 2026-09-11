/* Local portal + real Cloudflare Worker. Never changes the published config. */
'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const options = { port: 4187, 'relay-port': 8787 };
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8' };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let server;
let worker;
let stopping = false;
let ready = false;

async function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    ready = false;
    process.exitCode = code;
    if (server) {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
    if (worker && worker.exitCode === null && worker.signalCode === null) {
        const owned = worker;
        const signal = name => {
            try {
                if (process.platform === 'win32') owned.kill(name);
                else process.kill(-owned.pid, name);
            } catch (error) { if (error.code !== 'ESRCH') throw error; }
        };
        signal('SIGTERM');
        await Promise.race([new Promise(resolve => owned.once('exit', resolve)), delay(4000)]);
        if (owned.exitCode === null && owned.signalCode === null) signal('SIGKILL');
    }
}

async function health(base) {
    let response;
    try { response = await fetch(base + '/health', { signal: AbortSignal.timeout(1500) }); }
    catch (error) {
        if (error.cause && error.cause.code === 'ECONNREFUSED') return false;
        throw new Error('Le port du relais ne répond pas correctement : ' + base);
    }
    let data;
    try { data = await response.json(); } catch (_) { /* Refuse another local service. */ }
    if (!response.ok || data?.service !== 'evportal-pairing-relay' || data?.status !== 'ok') {
        throw new Error('Un autre service occupe le port du relais. Utilisez --relay-port ; aucun processus existant ne sera arrêté.');
    }
    return true;
}

async function verifyRelay(base, origins) {
    for (const origin of origins) {
        const response = await fetch(base + '/v1/sessions', {
            method: 'OPTIONS', signal: AbortSignal.timeout(3000),
            headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Content-Type, Authorization' }
        });
        if (response.status !== 204 || response.headers.get('Access-Control-Allow-Origin') !== origin) {
            throw new Error('Le relais existant refuse ' + origin + '. Relancez-le avec cette origine autorisée ou choisissez un autre --relay-port.');
        }
    }
    let session;
    try {
        const created = await fetch(base + '/v1/sessions', {
            method: 'POST', signal: AbortSignal.timeout(3000),
            headers: { Origin: origins[0], 'Content-Type': 'application/json' }, body: '{}'
        });
        if (created.status !== 201) throw new Error('Création de session locale refusée (HTTP ' + created.status + ').');
        session = await created.json();
        if (!/^[a-f0-9]{32}$/.test(session.id) || !/^[a-f0-9]{64}$/.test(session.receiveToken)) {
            session = null;
            throw new Error('Réponse de session locale invalide.');
        }
        const waiting = await fetch(base + '/v1/sessions/' + session.id, {
            signal: AbortSignal.timeout(3000), headers: { Origin: origins[1], Authorization: 'Bearer ' + session.receiveToken }
        });
        if (!waiting.ok || waiting.headers.get('Access-Control-Allow-Origin') !== origins[1] || (await waiting.json()).status !== 'waiting') {
            throw new Error('La réception locale ne répond pas correctement.');
        }
    } finally {
        if (session) {
            const removed = await fetch(base + '/v1/sessions/' + session.id, {
                method: 'DELETE', signal: AbortSignal.timeout(3000),
                headers: { Origin: origins[0], Authorization: 'Bearer ' + session.receiveToken }
            });
            if (removed.status !== 204) throw new Error('La session de vérification locale ne peut pas être fermée.');
        }
    }
}

async function main() {
    const args = process.argv.slice(2);
    if (args.includes('--help')) {
        console.log('npm run dev -- [--port 4187] [--relay-port 8787]\nNode.js 22+ et npm ci --prefix relay sont requis. Écoute sur 127.0.0.1 uniquement.');
        return;
    }
    for (let index = 0; index < args.length; index += 2) {
        const key = args[index].replace(/^--/, '');
        const value = Number(args[index + 1]);
        if (!args[index].startsWith('--') || !Object.hasOwn(options, key) || !Number.isInteger(value) || value < 1024 || value > 65535) {
            throw new Error('Options invalides. Utilisez npm run dev -- --help.');
        }
        options[key] = value;
    }
    if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Le relais local nécessite Node.js 22 ou supérieur.');
    if (options.port === options['relay-port']) throw new Error('Le portail et le relais doivent utiliser deux ports distincts.');
    const relay = 'http://127.0.0.1:' + options['relay-port'];
    const origins = ['http://127.0.0.1:' + options.port, 'http://localhost:' + options.port];
    const hosts = new Set(origins.map(origin => new URL(origin).host));
    const configuration = '/* Generated by npm run dev; the published file is untouched. */\n'
        + 'if (' + JSON.stringify(origins) + '.includes(window.location.origin)) window.EV_CONFIG = Object.freeze({pairingRelayURL:' + JSON.stringify(relay) + '});\n';
    server = http.createServer(async (request, response) => {
        const send = (status, body, type = 'text/plain; charset=utf-8') => {
            response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
            response.end(request.method === 'HEAD' ? undefined : body);
        };
        if (!hosts.has(request.headers.host)) return send(403, 'Origine locale requise.');
        if (!['GET', 'HEAD'].includes(request.method)) return send(405, 'Méthode non autorisée.');
        if (!ready) return send(503, 'Le relais local démarre. Rechargez la page dans quelques secondes.');
        try {
            const requestedURL = new URL(request.url, origins[0]);
            let relative = decodeURIComponent(requestedURL.pathname).replace(/^\/EvPortal(?=\/|$)/, '').replace(/^\//, '') || 'index.html';
            if (/^(en|fr|es|de|it|ru|ar|pt)$/.test(relative)) {
                response.writeHead(301, { Location: requestedURL.pathname + '/' + requestedURL.search, 'Cache-Control': 'no-store' });
                return response.end();
            }
            const localizedPage = /^(en|fr|es|de|it|ru|ar|pt)\/(index\.html|aide\.html)?$/.test(relative);
            if (localizedPage && relative.endsWith('/')) relative += 'index.html';
            const parts = relative.split('/');
            if (parts.some(part => part.startsWith('.') || part.includes('\\') || part.includes('\0'))) return send(404, 'Introuvable.');
            if (relative === 'js/config.js') return send(200, configuration, mime['.js']);
            if (!localizedPage && !['index.html', 'aide.html', 'robots.txt', 'sitemap.xml'].includes(relative) && !['css', 'js', 'img', 'fonts'].includes(parts[0])) return send(404, 'Introuvable.');
            const filename = await fs.realpath(path.resolve(root, relative));
            if (!filename.startsWith(root + path.sep)) return send(404, 'Introuvable.');
            const bytes = await fs.readFile(filename);
            send(200, bytes, mime[path.extname(filename)] || 'application/octet-stream');
        } catch (_) { send(404, 'Introuvable.'); }
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(options.port, '127.0.0.1', resolve);
    }).catch(error => {
        if (error.code === 'EADDRINUSE') throw new Error('Le port ' + options.port + ' est déjà utilisé. Arrêtez votre aperçu existant ou utilisez --port ; aucun processus existant ne sera arrêté.');
        throw error;
    });
    console.log('Vérification du relais local…');
    const reused = await health(relay);
    if (!reused) {
        const wrangler = path.join(root, 'relay/node_modules/wrangler/bin/wrangler.js');
        try { await fs.access(wrangler); } catch (_) { throw new Error('Installez le relais avec npm ci --prefix relay, puis relancez npm run dev.'); }
        worker = spawn(process.execPath, [wrangler, 'dev', '--local', '--ip', '127.0.0.1', '--port', String(options['relay-port']), '--inspector-port', '0', '--persist-to', path.join(root, 'relay/.wrangler/dev-' + options['relay-port']), '--log-level', 'warn', '--var', 'ALLOWED_ORIGINS:' + origins.join(',')], {
            cwd: path.join(root, 'relay'), stdio: ['ignore', 'inherit', 'inherit'],
            detached: process.platform !== 'win32', env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' }
        });
        worker.on('error', error => { console.error('Démarrage Wrangler impossible : ' + error.message); stop(1); });
        worker.on('exit', () => {
            if (!stopping) { console.error('Le relais local s’est arrêté. Relancez npm run dev.'); stop(1); }
        });
        const deadline = Date.now() + 45000;
        while (!stopping && !(await health(relay))) {
            if (Date.now() > deadline) throw new Error('Le relais ne démarre pas dans le délai prévu.');
            await delay(250);
        }
    }
    if (stopping) return;
    await verifyRelay(relay, origins);
    if (stopping) return;
    ready = true;
    console.log('EvPortal prêt : ' + origins[0] + '/\nRelais réel : ' + relay + (reused ? ' (existant, conservé à l’arrêt)' : ' (arrêté avec ce serveur)')
        + '\nOuvrez Paramètres → Téléphone → Recevoir pour afficher le QR.\nCet aperçu reste local au PC. Ctrl+C pour arrêter.');
}

process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());
main().catch(async error => { console.error(error.message); await stop(1); });
