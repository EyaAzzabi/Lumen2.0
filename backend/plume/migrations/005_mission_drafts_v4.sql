CREATE TABLE IF NOT EXISTS mission_drafts (
 id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL REFERENCES organizations(id),
 created_by TEXT NOT NULL REFERENCES users(id),
 version INTEGER NOT NULL CHECK(version>0),
 status TEXT NOT NULL CHECK(status IN ('draft','archived','filed')),
 created_at REAL NOT NULL,
 updated_at REAL NOT NULL,
 filed_plan_id TEXT REFERENCES plans(id),
 payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS mission_draft_owner ON mission_drafts(organization_id,status,updated_at);
INSERT OR IGNORE INTO schema_versions VALUES(5,strftime('%s','now'));
