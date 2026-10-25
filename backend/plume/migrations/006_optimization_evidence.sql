CREATE TABLE IF NOT EXISTS optimization_runs (
 id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL REFERENCES organizations(id),
 user_id TEXT NOT NULL REFERENCES users(id),
 created_at REAL NOT NULL,
 plan_id TEXT REFERENCES plans(id),
 plan_revision INTEGER,
 payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS optimization_owner ON optimization_runs(organization_id,created_at);
INSERT OR IGNORE INTO schema_versions VALUES(6,strftime('%s','now'));
