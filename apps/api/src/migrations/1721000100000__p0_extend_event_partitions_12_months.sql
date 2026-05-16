-- 1721000100000__p0_extend_event_partitions_12_months.sql
-- P0-9 (audit 2026-05-16): create monthly partitions through 2027-07 for
-- stockpile_event and fuel_tank_event. The original migrations only created
-- partitions through 2026-07; the first INSERT after 2026-08-01 would raise
-- `no partition of relation found for row` — a hard outage of the two
-- highest-volume operational tables.
--
-- IF NOT EXISTS guards every CREATE so this migration is idempotent and
-- safe to re-run during recovery.

-- ─── stockpile_event ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stockpile_event_2026_08 PARTITION OF stockpile_event
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE IF NOT EXISTS stockpile_event_2026_09 PARTITION OF stockpile_event
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS stockpile_event_2026_10 PARTITION OF stockpile_event
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE IF NOT EXISTS stockpile_event_2026_11 PARTITION OF stockpile_event
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE IF NOT EXISTS stockpile_event_2026_12 PARTITION OF stockpile_event
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE IF NOT EXISTS stockpile_event_2027_01 PARTITION OF stockpile_event
  FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
CREATE TABLE IF NOT EXISTS stockpile_event_2027_02 PARTITION OF stockpile_event
  FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');
CREATE TABLE IF NOT EXISTS stockpile_event_2027_03 PARTITION OF stockpile_event
  FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');
CREATE TABLE IF NOT EXISTS stockpile_event_2027_04 PARTITION OF stockpile_event
  FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');
CREATE TABLE IF NOT EXISTS stockpile_event_2027_05 PARTITION OF stockpile_event
  FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');
CREATE TABLE IF NOT EXISTS stockpile_event_2027_06 PARTITION OF stockpile_event
  FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');
CREATE TABLE IF NOT EXISTS stockpile_event_2027_07 PARTITION OF stockpile_event
  FOR VALUES FROM ('2027-07-01') TO ('2027-08-01');

-- ─── fuel_tank_event ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fuel_tank_event_2026_08 PARTITION OF fuel_tank_event
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE IF NOT EXISTS fuel_tank_event_2026_09 PARTITION OF fuel_tank_event
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS fuel_tank_event_2026_10 PARTITION OF fuel_tank_event
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE IF NOT EXISTS fuel_tank_event_2026_11 PARTITION OF fuel_tank_event
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE IF NOT EXISTS fuel_tank_event_2026_12 PARTITION OF fuel_tank_event
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE IF NOT EXISTS fuel_tank_event_2027_01 PARTITION OF fuel_tank_event
  FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
CREATE TABLE IF NOT EXISTS fuel_tank_event_2027_02 PARTITION OF fuel_tank_event
  FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');
CREATE TABLE IF NOT EXISTS fuel_tank_event_2027_03 PARTITION OF fuel_tank_event
  FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');
CREATE TABLE IF NOT EXISTS fuel_tank_event_2027_04 PARTITION OF fuel_tank_event
  FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');
CREATE TABLE IF NOT EXISTS fuel_tank_event_2027_05 PARTITION OF fuel_tank_event
  FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');
CREATE TABLE IF NOT EXISTS fuel_tank_event_2027_06 PARTITION OF fuel_tank_event
  FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');
CREATE TABLE IF NOT EXISTS fuel_tank_event_2027_07 PARTITION OF fuel_tank_event
  FOR VALUES FROM ('2027-07-01') TO ('2027-08-01');

-- TODO(v1.2): replace this manual extension with `pg_partman` set up to
-- maintain a 6-month rolling window. Track in audits/v1.0-v1.1 backlog.
