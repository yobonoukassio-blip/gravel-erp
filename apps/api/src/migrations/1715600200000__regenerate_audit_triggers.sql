-- W2-P03-T01 — extend audit triggers to cover the 2 sync-scoped tables added
-- in 1715600000000__create_daily_activity_log.sql.
--
-- This is the regenerated artifact produced by re-running
-- `scripts/generate-audit-triggers.ts` against the post-migration schema.
-- The original 1715500700000 migration's CREATE FUNCTION is idempotent
-- (CREATE OR REPLACE) — only the two new triggers need to be attached here.
--
-- Source: D-27, D-28, PITFALLS.md #6.

-- Re-affirm the trigger function (CREATE OR REPLACE — no behavioral change).
-- The full body is intentionally NOT duplicated here; the function defined in
-- 1715500700000__generate_audit_triggers.sql is already in place. If a future
-- regeneration changes the function body, this file should be regenerated too.

DROP TRIGGER IF EXISTS audit_daily_activity_log ON daily_activity_log;
CREATE TRIGGER audit_daily_activity_log
  AFTER INSERT OR UPDATE OR DELETE ON daily_activity_log
  FOR EACH ROW EXECUTE FUNCTION gravel_audit_trigger();

DROP TRIGGER IF EXISTS audit_user_preferences ON user_preferences;
CREATE TRIGGER audit_user_preferences
  AFTER INSERT OR UPDATE OR DELETE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION gravel_audit_trigger();
