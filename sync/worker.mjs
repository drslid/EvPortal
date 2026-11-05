import { createHandler } from './handler.mjs';
export function d1Repository(db) {
    return {
        async get(id) { const row = await db.prepare('SELECT id, token_hash, revision, updated_at, envelope FROM profiles WHERE id = ?').bind(id).first(); return row ? { id: row.id, tokenHash: row.token_hash, revision: row.revision, updatedAt: row.updated_at, envelope: JSON.parse(row.envelope) } : null; },
        async create(record) { const result = await db.prepare('INSERT INTO profiles (id, token_hash, revision, updated_at, envelope) SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM revoked_profiles WHERE id = ?) ON CONFLICT(id) DO NOTHING').bind(record.id, record.tokenHash, record.revision, record.updatedAt, JSON.stringify(record.envelope), record.id).run(); return result.meta.changes === 1; },
        async update(id, tokenHash, revision, envelope, updatedAt) { const result = await db.prepare('UPDATE profiles SET revision = revision + 1, updated_at = ?, envelope = ? WHERE id = ? AND token_hash = ? AND revision = ?').bind(updatedAt, JSON.stringify(envelope), id, tokenHash, revision).run(); return result.meta.changes === 1; },
        async remove(id, tokenHash) { await db.batch([
            db.prepare('INSERT INTO revoked_profiles (id) SELECT id FROM profiles WHERE id = ? AND token_hash = ? ON CONFLICT(id) DO NOTHING').bind(id, tokenHash),
            db.prepare('DELETE FROM profiles WHERE id = ? AND token_hash = ?').bind(id, tokenHash)
        ]); }
    };
}
let cached;
let cachedDB;
let cachedOrigins;
export default { async fetch(request, env) {
    if (env.SYNC_ENABLED !== 'true') return new Response(JSON.stringify({ error: 'SYNC_DISABLED' }), { status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
    if (!env.DB) return new Response('Service unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
    if (!cached || cachedDB !== env.DB || cachedOrigins !== env.ALLOWED_ORIGINS) {
        cachedDB = env.DB; cachedOrigins = env.ALLOWED_ORIGINS;
        cached = createHandler({ repository: d1Repository(env.DB), allowedOrigins: (env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean) });
    }
    return cached(request, request.headers.get('CF-Connecting-IP') || 'unknown');
} };
