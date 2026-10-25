-- One row per language-model request, for per-organization AI quotas.
CREATE TABLE IF NOT EXISTS ai_usage (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 organization_id TEXT NOT NULL REFERENCES organizations(id),
 user_id TEXT NOT NULL,
 kind TEXT NOT NULL,
 created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_usage_owner ON ai_usage(organization_id,created_at);
INSERT OR IGNORE INTO schema_versions VALUES(7,strftime('%s','now'));
