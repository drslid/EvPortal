export const SESSION_TTL_MS = 5 * 60 * 1000;
export const MAX_PLAINTEXT_BYTES = 64 * 1024;
export const MAX_BODY_BYTES = 100 * 1024;
export const ID_PATTERN = /^[a-f0-9]{32}$/;
export const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

export class HTTPError extends Error {
    constructor(status, code) { super(code); this.status = status; this.code = code; }
}

export function json(body, status = 200, headers = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
    });
}

export function errorResponse(error) {
    return json({ error: error instanceof HTTPError ? error.code : 'unavailable' }, error instanceof HTTPError ? error.status : 503);
}

export function randomHex(bytes) {
    return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), value => value.toString(16).padStart(2, '0')).join('');
}

export async function digest(value) {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function equalTokenHashes(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== 64 || b.length !== 64) return false;
    let difference = 0;
    for (let index = 0; index < 64; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
    return difference === 0;
}

export function bearer(request) {
    const match = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('Authorization') || '');
    if (!match) throw new HTTPError(401, 'unauthorized');
    return match[1];
}

export async function readJSON(request, maxBytes = MAX_BODY_BYTES) {
    if ((request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
        throw new HTTPError(415, 'json_required');
    }
    if (Number(request.headers.get('Content-Length')) > maxBytes) throw new HTTPError(413, 'body_too_large');
    if (!request.body) throw new HTTPError(400, 'invalid_json');
    const reader = request.body.getReader();
    let length = 0;
    const chunks = [];
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            length += value.byteLength;
            if (length > maxBytes) {
                await reader.cancel();
                throw new HTTPError(413, 'body_too_large');
            }
            chunks.push(value);
        }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch (_) { throw new HTTPError(400, 'invalid_json'); }
}

function base64urlBytes(value) {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(value) || value.length % 4 === 1) throw new HTTPError(400, 'invalid_payload');
    let decoded;
    try { decoded = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)); }
    catch (_) { throw new HTTPError(400, 'invalid_payload'); }
    const canonical = btoa(decoded).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    if (canonical !== value) throw new HTTPError(400, 'invalid_payload');
    return decoded.length;
}

export function validatePayload(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).sort().join(',') !== 'ciphertext,iv') {
        throw new HTTPError(400, 'invalid_payload');
    }
    if (typeof payload.iv !== 'string' || payload.iv.length !== 16 || base64urlBytes(payload.iv) !== 12) throw new HTTPError(400, 'invalid_payload');
    if (typeof payload.ciphertext !== 'string') throw new HTTPError(400, 'invalid_payload');
    if (payload.ciphertext.length > Math.ceil((MAX_PLAINTEXT_BYTES + 16) * 4 / 3)) throw new HTTPError(413, 'payload_too_large');
    const size = base64urlBytes(payload.ciphertext);
    if (size < 16) throw new HTTPError(400, 'invalid_payload');
    if (size > MAX_PLAINTEXT_BYTES + 16) throw new HTTPError(413, 'payload_too_large');
    return { iv: payload.iv, ciphertext: payload.ciphertext };
}
