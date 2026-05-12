-- W2-P03-T01 — PowerSync logical-replication publication.
-- Source: D-10, RESEARCH.md Pattern 4, PITFALLS.md #3 (single-replica Phase 1).
--
-- PowerSync service consumes this publication via its own logical-replication
-- slot. The slot itself is created by the PowerSync server at boot — DO NOT
-- pre-create it here (it would race with the service).
--
-- Phase 1 scope (D-12): only the 2 sync-replicated tables are published.

CREATE PUBLICATION powersync FOR TABLE daily_activity_log, user_preferences;

-- Sanity check (commented out — for diagnostics only):
--   SELECT pubname, schemaname, tablename FROM pg_publication_tables WHERE pubname='powersync';
