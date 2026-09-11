import { HTTPError, SESSION_TTL_MS, bearer, digest, equalTokenHashes, errorResponse, json, randomHex, readJSON, validatePayload } from './protocol.js';

// Fetch-based Durable Objects do not require exposing RPC methods to the browser.
export class PairingSession {
    constructor(ctx) { this.ctx = ctx; }

    async fetch(request) {
        try {
            const url = new URL(request.url);
            if (url.pathname === '/initialize' && request.method === 'POST') return await this.initialize();
            if (url.pathname !== '/session' || !['GET', 'PUT', 'DELETE'].includes(request.method)) throw new HTTPError(404, 'not_found');
            const tokenHash = await digest(bearer(request));
            const payload = request.method === 'PUT' ? validatePayload(await readJSON(request)) : undefined;
            return await this.ctx.storage.transaction(async txn => {
                const session = await txn.get('session');
                if (!session || session.expiresAt <= Date.now()) {
                    if (session) await txn.delete('session');
                    return json({ error: 'expired' }, 410);
                }
                const expected = request.method === 'PUT' ? session.sendHash : session.receiveHash;
                if (!equalTokenHashes(tokenHash, expected)) throw new HTTPError(401, 'unauthorized');
                if (request.method === 'DELETE') {
                    await txn.delete('session');
                    return new Response(null, { status: 204 });
                }
                if (request.method === 'GET') return json({ status: session.payload ? 'ready' : 'waiting', expiresAt: session.expiresAt, ...(session.payload ? { payload: session.payload } : {}) });
                if (session.payload) {
                    if (session.payload.iv === payload.iv && session.payload.ciphertext === payload.ciphertext) return json({ status: 'sent' });
                    throw new HTTPError(409, 'already_sent');
                }
                session.payload = payload;
                await txn.put('session', session);
                return json({ status: 'sent' });
            });
        } catch (error) { return errorResponse(error); }
    }

    async initialize() {
        const receiveToken = randomHex(32);
        const sendToken = randomHex(32);
        const [receiveHash, sendHash] = await Promise.all([digest(receiveToken), digest(sendToken)]);
        const expiresAt = Date.now() + SESSION_TTL_MS;
        return this.ctx.blockConcurrencyWhile(async () => {
            if (await this.ctx.storage.get('session')) throw new HTTPError(409, 'already_exists');
            // Register cleanup before saving: an initialization failure must not leave data without an alarm.
            await this.ctx.storage.setAlarm(expiresAt);
            await this.ctx.storage.put('session', { expiresAt, receiveHash, sendHash });
            return json({ receiveToken, sendToken, expiresAt }, 201);
        });
    }

    async alarm() {
        await this.ctx.blockConcurrencyWhile(async () => {
            const session = await this.ctx.storage.get('session');
            if (session && session.expiresAt > Date.now()) await this.ctx.storage.setAlarm(session.expiresAt);
            else await this.ctx.storage.deleteAll();
        });
    }
}
