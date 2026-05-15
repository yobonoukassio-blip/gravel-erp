-- Phase 1 follow-up — singular-name views for tables stored under plural names.
--
-- Some legacy callers (and incoming code from Angular services that follow
-- DDD entity naming) expect singular table names. We expose lightweight
-- read-only views to bridge the gap without renaming the canonical tables.

CREATE OR REPLACE VIEW site            AS SELECT * FROM sites;
CREATE OR REPLACE VIEW country         AS SELECT * FROM countries;
CREATE OR REPLACE VIEW bench           AS SELECT * FROM benches;
CREATE OR REPLACE VIEW permit          AS SELECT * FROM permits;
CREATE OR REPLACE VIEW production_zone AS SELECT * FROM production_zones;
CREATE OR REPLACE VIEW shift           AS SELECT * FROM shifts;
-- operational_day is created in 1715800100000__operational_day_runtime_columns.sql
-- (it adds the `date` alias column, so we keep that single source of truth).
