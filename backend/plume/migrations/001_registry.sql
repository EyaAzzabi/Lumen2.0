-- Version 1: transactional registry. JSON payloads preserve legacy/forward fields.
CREATE TABLE IF NOT EXISTS schema_versions(version INTEGER PRIMARY KEY, applied_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS organizations(id TEXT PRIMARY KEY, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, demo INTEGER NOT NULL, created_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS memberships(user_id TEXT REFERENCES users(id), organization_id TEXT REFERENCES organizations(id), role TEXT NOT NULL, PRIMARY KEY(user_id,organization_id,role));
CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id), payload TEXT NOT NULL, deleted_at REAL);
CREATE TABLE IF NOT EXISTS plans(id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id), payload TEXT NOT NULL, created_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS revisions(id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES plans(id), number INTEGER NOT NULL, payload TEXT NOT NULL, UNIQUE(plan_id,number));
CREATE TABLE IF NOT EXISTS assessments(id TEXT PRIMARY KEY, revision_id TEXT NOT NULL UNIQUE REFERENCES revisions(id), payload TEXT NOT NULL, created_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS notices(id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES plans(id), revision_id TEXT NOT NULL REFERENCES revisions(id), sender_id TEXT NOT NULL REFERENCES organizations(id), recipient_id TEXT NOT NULL REFERENCES organizations(id), payload TEXT NOT NULL, created_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS responses(id TEXT PRIMARY KEY, notice_id TEXT NOT NULL REFERENCES notices(id), actor_id TEXT REFERENCES users(id), organization_id TEXT NOT NULL REFERENCES organizations(id), payload TEXT NOT NULL, created_at REAL);
CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, plan_id TEXT REFERENCES plans(id), revision_id TEXT REFERENCES revisions(id), actor_id TEXT, organization_id TEXT REFERENCES organizations(id), type TEXT NOT NULL, payload TEXT NOT NULL, created_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS idempotency(scope TEXT NOT NULL, key TEXT NOT NULL, request_hash TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(scope,key));
CREATE TABLE IF NOT EXISTS sessions(id_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), organization_id TEXT NOT NULL REFERENCES organizations(id), csrf TEXT NOT NULL, expires_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY, payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS notice_recipient ON notices(recipient_id,created_at);
CREATE INDEX IF NOT EXISTS event_plan ON events(plan_id,created_at);
INSERT OR IGNORE INTO schema_versions VALUES(1, strftime('%s','now'));
