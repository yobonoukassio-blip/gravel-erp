-- HRD-MVP-05 Task 1 — add tenants.compliance_email (D-16)
-- D-16: quarterly audit-export cron emails this address.
--
-- NOTE: the real `tenants` schema (see 1715500100000__create_tenancy_schema.sql)
-- has NO `billing_email` column today, so there is no automatic backfill source.
-- The column is nullable; ops must populate it per tenant before the quarterly
-- cron run (cron filters tenants where compliance_email IS NOT NULL — D-16).
-- A future plan can introduce a billing_email column and backfill from it.

BEGIN;

-- 1. Add nullable column
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS compliance_email VARCHAR(255);

-- 2. Email-format CHECK (NULL-tolerant). Use IF NOT EXISTS via DO block since
--    Postgres doesn't support `ADD CONSTRAINT IF NOT EXISTS` until v18.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'tenants_compliance_email_format'
       AND conrelid = 'tenants'::regclass
  ) THEN
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_compliance_email_format
      CHECK (
        compliance_email IS NULL
        OR compliance_email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
      );
  END IF;
END $$;

COMMIT;
