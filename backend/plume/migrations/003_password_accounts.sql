-- Password accounts from feature/auth-and-template-ui, stored transactionally.
CREATE TABLE IF NOT EXISTS accounts(user_id TEXT PRIMARY KEY REFERENCES users(id), email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL, password_hash TEXT NOT NULL, organization_id TEXT NOT NULL REFERENCES organizations(id));
CREATE TABLE IF NOT EXISTS organization_invites(organization_id TEXT PRIMARY KEY REFERENCES organizations(id), code TEXT NOT NULL UNIQUE COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS organization_names(name TEXT PRIMARY KEY COLLATE NOCASE, organization_id TEXT UNIQUE REFERENCES organizations(id));
CREATE TABLE IF NOT EXISTS login_attempts(key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, window_start REAL NOT NULL);
INSERT OR IGNORE INTO schema_versions VALUES(3,strftime('%s','now'));
