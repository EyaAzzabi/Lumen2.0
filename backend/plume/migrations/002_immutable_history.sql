-- Version 2: application history is append-only, including accidental SQL writes.
CREATE TRIGGER IF NOT EXISTS immutable_events_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT,'events are append-only'); END;
CREATE TRIGGER IF NOT EXISTS immutable_events_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT,'events are append-only'); END;
CREATE TRIGGER IF NOT EXISTS immutable_responses_update BEFORE UPDATE ON responses BEGIN SELECT RAISE(ABORT,'responses are append-only'); END;
CREATE TRIGGER IF NOT EXISTS immutable_responses_delete BEFORE DELETE ON responses BEGIN SELECT RAISE(ABORT,'responses are append-only'); END;
CREATE TRIGGER IF NOT EXISTS immutable_revisions_update BEFORE UPDATE ON revisions BEGIN SELECT RAISE(ABORT,'revisions are immutable'); END;
CREATE TRIGGER IF NOT EXISTS immutable_revisions_delete BEFORE DELETE ON revisions BEGIN SELECT RAISE(ABORT,'revisions are immutable'); END;
CREATE TRIGGER IF NOT EXISTS immutable_assessments_update BEFORE UPDATE ON assessments BEGIN SELECT RAISE(ABORT,'assessments are immutable'); END;
CREATE TRIGGER IF NOT EXISTS immutable_assessments_delete BEFORE DELETE ON assessments BEGIN SELECT RAISE(ABORT,'assessments are immutable'); END;
INSERT OR IGNORE INTO schema_versions VALUES(2, strftime('%s','now'));
