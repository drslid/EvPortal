import { HTTPError, ID_PATTERN, bearer, digest, errorResponse, json, randomHex, readJSON } from './protocol.js';
export { PairingSession } from './session.js';

const DEFAULT_ORIGINS = ['https://drslid.github.io'];
const METHODS = ['GET', 'POST', 'PUT', 'DELETE'];

function originAllowed(origin, env) {
    const allowed = typeof env.ALLOWED_ORIGINS === 'string' ? env.ALLOWED_ORIGINS.split(',').map(value => value.trim()) : DEFAULT_ORIGINS;
    return origin !== null && allowed.includes(origin);
}

function withHeaders(response, origin, allowed) {
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store');
    headers.set('Pragma', 'no-cache');
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Vary', 'Origin');
    if (allowed) {
        headers.set('Access-Control-Allow-Origin', origin);
        headers.set('Access-Control-Expose-Headers', 'Retry-After');
    }
    return new Response(response.body, { status: response.status, headers });
}

async function route(request, env, allowed) {
    const url = new URL(request.url);
    if (url.search) throw new HTTPError(400, 'query_not_allowed');
    if (url.pathname === '/health' && request.method === 'GET') return json({ status: 'ok', service: 'evportal-pairing-relay' });
    if (!allowed) throw new HTTPError(403, 'origin_not_allowed');
    if (request.method === 'OPTIONS') {
        const method = request.headers.get('Access-Control-Request-Method');
        const headers = (request.headers.get('Access-Control-Request-Headers') || '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
        if (!METHODS.includes(method) || headers.some(value => !['authorization', 'content-type'].includes(value))) throw new HTTPError(400, 'invalid_preflight');
        return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Methods': METHODS.join(', '), 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '300' } });
    }
    if (url.pathname === '/v1/sessions' && request.method === 'POST') {
        if (!env.CREATE_LIMITER || !env.PAIRING_SESSIONS) throw new HTTPError(503, 'unavailable');
        const ipHash = await digest(request.headers.get('CF-Connecting-IP') || 'local');
        if (!(await env.CREATE_LIMITER.limit({ key: 'create:' + ipHash })).success) return json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' });
        const body = await readJSON(request, 1024);
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) throw new HTTPError(400, 'empty_body_required');
        const id = randomHex(16);
        const object = env.PAIRING_SESSIONS.get(env.PAIRING_SESSIONS.idFromName(id));
        const response = await object.fetch('https://session.internal/initialize', { method: 'POST' });
        if (!response.ok) return response;
        return json({ id, ...await response.json() }, 201);
    }
    const match = /^\/v1\/sessions\/([a-f0-9]+)$/.exec(url.pathname);
    if (!match || !ID_PATTERN.test(match[1])) throw new HTTPError(404, 'not_found');
    if (!['GET', 'PUT', 'DELETE'].includes(request.method)) throw new HTTPError(405, 'method_not_allowed');
    const token = bearer(request);
    if (!env.REQUEST_LIMITER || !env.PAIRING_SESSIONS) throw new HTTPError(503, 'unavailable');
    const ipHash = await digest(request.headers.get('CF-Connecting-IP') || 'local');
    if (!(await env.REQUEST_LIMITER.limit({ key: 'request:' + ipHash })).success) return json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' });
    const object = env.PAIRING_SESSIONS.get(env.PAIRING_SESSIONS.idFromName(match[1]));
    return object.fetch(new Request('https://session.internal/session', {
        method: request.method,
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': request.headers.get('Content-Type') || '', ...(request.headers.has('Content-Length') ? { 'Content-Length': request.headers.get('Content-Length') } : {}) },
        body: request.method === 'PUT' ? request.body : undefined,
        duplex: request.method === 'PUT' ? 'half' : undefined
    }));
}

export default {
    async fetch(request, env) {
        const origin = request.headers.get('Origin');
        const allowed = originAllowed(origin, env);
        let response;
        try { response = await route(request, env, allowed); }
        catch (error) { response = errorResponse(error); }
        return withHeaders(response, origin, allowed);
    }
};
