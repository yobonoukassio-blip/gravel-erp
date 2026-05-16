-- FND-07 — Three-representation money columns + fx_rate reference table.
--
-- Phase 1 v1.0 spec calls for every monetary row to carry:
--   - amount_original_minor        : entered/source amount in source currency
--   - amount_site_functional_minor : converted to the site's functional currency
--   - amount_group_minor           : converted to the group reporting currency (XOF)
--   - fx_rate_id                   : reference to the FX snapshot used
--
-- Additive only. No data loss; legacy amount_minor_units is preserved.
-- Backfill strategy: legacy rows are treated as already-functional (fx_rate=1.0,
-- group=functional=original). Writers updated after migration to populate all
-- three columns going forward.

CREATE TABLE IF NOT EXISTS fx_rate (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  rate_date       DATE NOT NULL,
  from_currency   CHAR(3) NOT NULL,
  to_currency     CHAR(3) NOT NULL,
  rate            NUMERIC(18, 8) NOT NULL CHECK (rate > 0),
  source          VARCHAR(40) NOT NULL DEFAULT 'manual',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, rate_date, from_currency, to_currency)
);
CREATE INDEX IF NOT EXISTS fx_rate_tenant_date_idx ON fx_rate (tenant_id, rate_date);
ALTER TABLE fx_rate ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fx_rate_tenant_isolation') THEN
    CREATE POLICY fx_rate_tenant_isolation ON fx_rate
      USING (tenant_id::text = current_setting('app.current_tenant', true));
  END IF;
END $$;

-- analytical_entry: add 3-rep columns + fx_rate link.
ALTER TABLE analytical_entry
  ADD COLUMN IF NOT EXISTS amount_original_minor        BIGINT,
  ADD COLUMN IF NOT EXISTS amount_site_functional_minor BIGINT,
  ADD COLUMN IF NOT EXISTS amount_group_minor           BIGINT,
  ADD COLUMN IF NOT EXISTS site_currency                CHAR(3),
  ADD COLUMN IF NOT EXISTS group_currency               CHAR(3),
  ADD COLUMN IF NOT EXISTS fx_rate_id                   UUID REFERENCES fx_rate(id);

-- Backfill: legacy rows = original=functional=group (assumes single-currency until now).
UPDATE analytical_entry
   SET amount_original_minor        = amount_minor_units,
       amount_site_functional_minor = amount_minor_units,
       amount_group_minor           = amount_minor_units,
       site_currency                = currency,
       group_currency               = currency
 WHERE amount_original_minor IS NULL;

-- bon_de_livraison: same treatment (revenue at three representations).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bon_de_livraison') THEN
    EXECUTE 'ALTER TABLE bon_de_livraison
              ADD COLUMN IF NOT EXISTS amount_original_minor        BIGINT,
              ADD COLUMN IF NOT EXISTS amount_site_functional_minor BIGINT,
              ADD COLUMN IF NOT EXISTS amount_group_minor           BIGINT,
              ADD COLUMN IF NOT EXISTS fx_rate_id                   UUID REFERENCES fx_rate(id)';
  END IF;
END $$;

-- invoice: same treatment.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoice') THEN
    EXECUTE 'ALTER TABLE invoice
              ADD COLUMN IF NOT EXISTS amount_original_minor        BIGINT,
              ADD COLUMN IF NOT EXISTS amount_site_functional_minor BIGINT,
              ADD COLUMN IF NOT EXISTS amount_group_minor           BIGINT,
              ADD COLUMN IF NOT EXISTS fx_rate_id                   UUID REFERENCES fx_rate(id)';
  END IF;
END $$;
