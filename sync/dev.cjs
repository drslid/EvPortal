/* Loopback-only persistent JSON adapter for the production sync protocol. Node 22+. */
'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
function lockError(code = 'SYNC_STORE_LOCKED') {
    const error = new Error(code === 'SYNC_STORE_CLOSED' ? 'Le stockage de synchronisation locale est fermé.' : 'Le stockage de synchronisation locale est déjà utilisé ou son verrou ne peut pas être vérifié. Fermez l’autre aperçu avant de relancer ; aucun verrou inconnu n’est supprimé.');
    error.code = code;
    return error;
}
async function readLock(filename) {
    const handle = await fs.open(filename, 'r');
    try {
        if ((await handle.stat()).size > 1024) throw lockError();
        let value;
        try { value = JSON.parse(await handle.readFile('utf8')); } catch (_) { throw lockError(); }
        if (!value || value.version !== 1 || !Number.isInteger(value.pid) || value.pid < 1 || value.pid > 2147483647 || !/^[a-f0-9]{32}$/.test(value.nonce)) throw lockError();
        return value;
    } finally { await handle.close(); }
}
function processAlive(pid) {
    try { process.kill(pid, 0); return true; }
    catch (error) { if (error.code === 'ESRCH') return false; if (error.code === 'EPERM') return true; throw lockError(); }
}
function sameOwner(first, second) { return first && second && first.pid === second.pid && first.nonce === second.nonce; }
async function releaseOwnedLock(filename, owner, handle) {
    try {
        let current;
        try { current = await readLock(filename); } catch (error) { if (error.code === 'ENOENT' || error.code === 'SYNC_STORE_LOCKED') return false; throw error; }
        if (!sameOwner(current, owner)) return false;
        await fs.unlink(filename);
        return true;
    } finally { await handle.close(); }
}
async function acquireStoreLock(filename) {
    const lockfile = filename + '.lock';
    const reclaimfile = lockfile + '.reclaim';
    const owner = { version: 1, pid: process.pid, nonce: randomBytes(16).toString('hex') };
    await fs.mkdir(path.dirname(filename), { recursive: true });
    async function claim(target) {
        const handle = await fs.open(target, 'wx', 0o600);
        try { await handle.writeFile(JSON.stringify(owner)); await handle.sync(); return handle; }
        catch (error) { await handle.close(); throw error; }
    }
    for (let attempt = 0; attempt < 5; attempt++) {
        try { return { filename: lockfile, owner, handle: await claim(lockfile) }; }
        catch (error) { if (error.code !== 'EEXIST') throw error; }
        let previous;
        try { previous = await readLock(lockfile); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
        if (processAlive(previous.pid)) throw lockError();
        // Serialize stale-lock reclamation. A missing/corrupt reclaim owner is
        // deliberately left for inspection rather than risking another owner.
        let reclaim;
        try { reclaim = await claim(reclaimfile); }
        catch (error) { if (error.code === 'EEXIST') throw lockError(); throw error; }
        try {
            let current;
            try { current = await readLock(lockfile); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
            if (sameOwner(current, previous) && !processAlive(current.pid)) await fs.unlink(lockfile);
        } finally { await releaseOwnedLock(reclaimfile, owner, reclaim); }
    }
    throw lockError();
}
function fileRepository(filename) {
    filename = path.resolve(filename);
    let records;
    let revoked = new Set();
    let queue = Promise.resolve();
    let initialization;
    let lock;
    let closing = false;
    let closed = false;
    let closePromise;
    async function initializeStore() {
        lock = await acquireStoreLock(filename);
        try {
            const parsed = JSON.parse(await fs.readFile(filename, 'utf8'));
            if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.profiles)) throw new Error('Invalid sync store.');
            records = new Map();
            if (parsed.revoked !== undefined && (!Array.isArray(parsed.revoked) || parsed.revoked.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(id)))) throw new Error('Invalid sync store.');
            revoked = new Set(parsed.revoked || []);
            for (const item of parsed.profiles) {
                if (!item || !/^[A-Za-z0-9_-]{22}$/.test(item.id) || !/^[a-f0-9]{64}$/.test(item.tokenHash) || !Number.isSafeInteger(item.revision) || item.revision < 1 || !Number.isSafeInteger(item.updatedAt) || !item.envelope || records.has(item.id) || revoked.has(item.id)) throw new Error('Invalid sync store.');
                records.set(item.id, item);
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                records = null;
                await releaseOwnedLock(lock.filename, lock.owner, lock.handle);
                lock = null;
                throw new Error('Le fichier de synchronisation locale est invalide ; il est conservé.');
            }
            records = new Map();
        }
    }
    function ensureInitialized() {
        if (!initialization) initialization = initializeStore().catch(error => { initialization = null; throw error; });
        return initialization;
    }
    async function initialize() { if (closing || closed) throw lockError('SYNC_STORE_CLOSED'); await ensureInitialized(); }
    const copy = value => value ? JSON.parse(JSON.stringify(value)) : null;
    function transaction(callback, readonly = false) {
        if (closing || closed) return Promise.reject(lockError('SYNC_STORE_CLOSED'));
        const pending = queue.then(async () => {
            await ensureInitialized();
            if (!sameOwner(await readLock(lock.filename), lock.owner)) throw lockError();
            if (readonly) return callback(records);
            const next = new Map(Array.from(records, ([key, value]) => [key, copy(value)]));
            const nextRevoked = new Set(revoked);
            const result = callback(next, nextRevoked);
            if (result === false) return false;
            await fs.mkdir(path.dirname(filename), { recursive: true });
            const temporary = filename + '.tmp';
            await fs.writeFile(temporary, JSON.stringify({ version: 1, profiles: Array.from(next.values()), revoked: Array.from(nextRevoked) }), { mode: 0o600 });
            await fs.rename(temporary, filename);
            records = next;
            revoked = nextRevoked;
            return result;
        });
        queue = pending.catch(() => {});
        return pending;
    }
    function close() {
        if (closePromise) return closePromise;
        closing = true;
        closePromise = (async () => {
            await queue;
            if (initialization) { try { await initialization; } catch (_) { /* Initialization releases its own lock on failure. */ } }
            let released = true;
            if (lock) {
                const owned = lock; lock = null;
                released = await releaseOwnedLock(owned.filename, owned.owner, owned.handle);
            }
            closed = true;
            return released;
        })();
        return closePromise;
    }
    return {
        initialize,
        close,
        get(id) { return transaction(values => copy(values.get(id)), true); },
        create(record) { return transaction((next, denied) => { if (next.has(record.id) || denied.has(record.id)) return false; next.set(record.id, copy(record)); return true; }); },
        update(id, tokenHash, revision, envelope, updatedAt) { return transaction(next => {
            const record = next.get(id);
            if (!record || record.tokenHash !== tokenHash || record.revision !== revision) return false;
            next.set(id, { ...record, revision: revision + 1, envelope, updatedAt }); return true;
        }); },
        remove(id, tokenHash) { return transaction((next, denied) => { const record = next.get(id); if (!record || record.tokenHash !== tokenHash) return false; denied.add(id); next.delete(id); return true; }); }
    };
}
async function createDevServer(options = {}) {
    if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('La synchronisation locale nécessite Node.js 22 ou supérieur.');
    const { createHandler, MAX_BODY_BYTES } = await import('./handler.mjs');
    const repository = fileRepository(options.store || path.join(__dirname, '.local-store.json'));
    const handle = createHandler({ repository, allowedOrigins: options.origins || ['http://127.0.0.1:4187', 'http://localhost:4187'], ...(options.limits || {}) });
    await repository.initialize();
    const server = http.createServer(async (request, response) => {
        const fail = status => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end('{"error":"REQUEST_FAILED"}'); };
        try {
            const port = server.address().port;
            if (!['127.0.0.1:' + port, 'localhost:' + port].includes(request.headers.host)) return fail(403);
            const chunks = []; let size = 0;
            for await (const chunk of request) { size += chunk.length; if (size > MAX_BODY_BYTES) return fail(413); chunks.push(chunk); }
            const headers = new Headers();
            for (const [key, value] of Object.entries(request.headers)) if (value !== undefined && key !== 'host') headers.set(key, Array.isArray(value) ? value.join(',') : value);
            const incoming = new Request('http://127.0.0.1:' + port + request.url, { method: request.method, headers, body: ['GET', 'HEAD'].includes(request.method) ? undefined : Buffer.concat(chunks) });
            const result = await handle(incoming, request.socket.remoteAddress || 'unknown');
            response.writeHead(result.status, Object.fromEntries(result.headers));
            response.end(Buffer.from(await result.arrayBuffer()));
        } catch (_) { if (!response.headersSent) fail(500); else response.end(); }
    });
    const originalClose = server.close.bind(server);
    server.close = function (callback) {
        return originalClose(error => {
            repository.close().then(() => { if (callback) callback(error); }, closeError => { if (callback) callback(closeError); else server.emit('error', closeError); });
        });
    };
    try {
        await new Promise((resolve, reject) => { server.once('error', reject); server.listen(options.port === undefined ? 4399 : options.port, '127.0.0.1', resolve); });
    } catch (error) { await repository.close(); throw error; }
    return server;
}
async function main() {
    let port = 4399;
    let origins;
    let store;
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i += 2) {
        if (args[i] === '--port' && /^\d+$/.test(args[i + 1] || '')) port = Number(args[i + 1]);
        else if (args[i] === '--origins' && args[i + 1]) origins = args[i + 1].split(',');
        else if (args[i] === '--store' && args[i + 1]) store = path.resolve(args[i + 1]);
        else throw new Error('Usage : node sync/dev.cjs [--port 4399] [--origins http://127.0.0.1:4187,http://localhost:4187] [--store chemin]');
    }
    if (port < 1024 || port > 65535) throw new Error('Port invalide.');
    const server = await createDevServer({ port, origins, store });
    console.log('Synchronisation locale prête : http://127.0.0.1:' + server.address().port + ' (stockage JSON local, aucun compte externe)');
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { server.closeAllConnections(); server.close(); });
}
module.exports = { createDevServer, fileRepository };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
