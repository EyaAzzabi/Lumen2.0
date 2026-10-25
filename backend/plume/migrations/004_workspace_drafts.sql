CREATE TABLE IF NOT EXISTS workspace_drafts (
 user_id TEXT NOT NULL REFERENCES users(id),
 organization_id TEXT NOT NULL REFERENCES organizations(id),
 version INTEGER NOT NULL,
 payload TEXT NOT NULL,
 updated_at REAL NOT NULL,
 PRIMARY KEY(user_id, organization_id)
);

INSERT OR IGNORE INTO schema_versions VALUES(4,strftime('%s','now'));
