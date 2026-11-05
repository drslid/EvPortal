/* Shared protocol; the local adapter and D1 adapter use exactly these checks. */
export const MAX_BODY_BYTES = 1024 * 1024;
const ID = /^[A-Za-z0-9_-]{22}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const B64 = /^[A-Za-z0-9_-]+$/;
const security = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" };
function same(a, b) { if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false; let result = 0; for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i); return result === 0; }
export async function hashToken(token) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), value => value.toString(16).padStart(2, '0')).join(''); }
function validEnvelope(value) { return value && value.version === 1 && typeof value.iv === 'string' && /^[A-Za-z0-9_-]{16}$/.test(value.iv) && typeof value.ciphertext === 'string' && value.ciphertext.length >= 22 && value.ciphertext.length <= MAX_BODY_BYTES - 1024 && B64.test(value.ciphertext); }
function envelope(value) { return { version: 1, iv: value.iv, ciphertext: value.ciphertext }; }
async function readJSON(request) {
    if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) throw Object.assign(new Error(), { status: 415 });
    const length = request.headers.get('content-length');
    if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) throw Object.assign(new Error(), { status: 413 });
    const chunks = []; let size = 0;
    if (!request.body) throw Object.assign(new Error(), { status: 400 });
    const reader = request.body.getReader();
    for (;;) { const result = await reader.read(); if (result.done) break; size += result.value.byteLength; if (size > MAX_BODY_BYTES) { await reader.cancel(); throw Object.assign(new Error(), { status: 413 }); } chunks.push(result.value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; }
    catch (_) { throw Object.assign(new Error(), { status: 400 }); }
}
export function createHandler({ repository, allowedOrigins = [], now = Date.now, rateLimit = 120, createLimit = 10 }) {
    const origins = new Set(allowedOrigins);
    const buckets = new Map();
    function limited(ip, creating) {
        const time = now();
        for (const [key, value] of buckets) if (time - value.at > value.window) buckets.delete(key);
        const key = (creating ? 'create:' : 'request:') + ip;
        const window = creating ? 3600000 : 60000;
        let bucket = buckets.get(key);
        if (!bucket) { if (buckets.size >= 10000) return true; bucket = { at: time, count: 0, window }; buckets.set(key, bucket); }
        return ++bucket.count > (creating ? createLimit : rateLimit);
    }
    return async function handle(request, ip = 'unknown') {
        const origin = request.headers.get('origin');
        const cors = origin && origins.has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Max-Age': '600' } : { Vary: 'Origin' };
        function response(status, data) { return new Response(status === 204 ? null : JSON.stringify(data || { error: 'REQUEST_FAILED' }), { status, headers: { ...security, ...cors } }); }
        try {
            const url = new URL(request.url);
            if (url.pathname === '/health' && request.method === 'GET' && !url.search) return response(200, { service: 'evportal-config-sync', status: 'ok' });
            if (!origin || !origins.has(origin) || url.search) return response(403);
            const match = /^\/v1\/profiles\/([A-Za-z0-9_-]{22})$/.exec(url.pathname);
            const creating = url.pathname === '/v1/profiles' && request.method === 'POST';
            if (!creating && !match && !(url.pathname === '/v1/profiles' && request.method === 'OPTIONS')) return response(404);
            if (request.method === 'OPTIONS') return response(204);
            if (limited(ip, false) || (creating && limited(ip, true))) return response(429, { error: 'RATE_LIMITED' });
            const authorization = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('authorization') || '');
            if (!authorization) return response(401);
            const token = authorization[1];
            if (!TOKEN.test(token)) return response(401);
            const tokenHash = await hashToken(token);
            if (creating) {
                const body = await readJSON(request);
                if (!ID.test(body.profileId) || !validEnvelope(body.envelope)) return response(400);
                const updatedAt = now();
                const created = await repository.create({ id: body.profileId, tokenHash, revision: 1, updatedAt, envelope: envelope(body.envelope) });
                return created ? response(201, { revision: 1, updatedAt }) : response(409, { error: 'CONFLICT' });
            }
            if (!['GET', 'PUT', 'DELETE'].includes(request.method)) return response(405);
            const id = match[1];
            const record = await repository.get(id);
            if (!record || !same(record.tokenHash, tokenHash)) return response(401);
            if (request.method === 'GET') return response(200, { revision: record.revision, updatedAt: record.updatedAt, envelope: record.envelope });
            if (request.method === 'DELETE') { await repository.remove(id, tokenHash); return response(204); }
            const body = await readJSON(request);
            if (!Number.isSafeInteger(body.baseRevision) || body.baseRevision < 1 || !validEnvelope(body.envelope)) return response(400);
            const updatedAt = now();
            const changed = await repository.update(id, tokenHash, body.baseRevision, envelope(body.envelope), updatedAt);
            if (!changed) { const latest = await repository.get(id); return latest && same(latest.tokenHash, tokenHash) ? response(409, { error: 'CONFLICT', revision: latest.revision }) : response(401); }
            return response(200, { revision: body.baseRevision + 1, updatedAt });
        } catch (error) { return response(error.status || 500); }
    };
}
