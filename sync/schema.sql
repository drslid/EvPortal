CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK(revision > 0),
    updated_at INTEGER NOT NULL,
    envelope TEXT NOT NULL
);
-- Retain only the random identifier to prevent re-creation with a revoked code.
CREATE TABLE IF NOT EXISTS revoked_profiles (id TEXT PRIMARY KEY);
