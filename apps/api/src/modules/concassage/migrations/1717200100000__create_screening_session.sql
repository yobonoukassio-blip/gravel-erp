-- Migration: create screening_session table (CRI-01)
-- Mutable operational record — no chain-of-hash (ADR-0013)
-- Reuses crusher_session_status enum created in migration 1717200000000

CREATE TABLE IF NOT EXISTS screening_session (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id            UUID NOT NULL,
  site_id              UUID NOT NULL,
  operational_day_id   UUID NOT NULL,
  screen_id            UUID NOT NULL,
  input_stockpile_id   UUID NULL,
  session_start_utc    TIMESTAMPTZ NOT NULL,
  session_end_utc      TIMESTAMPTZ NULL,
  input_tonnage_kg     BIGINT NOT NULL DEFAULT 0,
  calibre_yields       JSONB NOT NULL DEFAULT '[]',
  -- calibre_yields schema:
  --   [{calibre_code, output_stockpile_id, tonnage_kg, is_nonconforming, nonconformity_reason}]
  -- nonconformity_reason MUST be non-null when is_nonconforming=true (enforced by CHECK below)
  operator_id          UUID NOT NULL,
  status               crusher_session_status NOT NULL DEFAULT 'ACTIVE',
  notes_md             TEXT,
  created_at_utc       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at_utc       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enforce: every is_nonconforming=true calibre entry must have nonconformity_reason
ALTER TABLE screening_session
  ADD CONSTRAINT calibre_yields_nonconforming_reason_required
  CHECK (
    NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(calibre_yields) elem
      WHERE (elem->>'is_nonconforming')::boolean = true
        AND (elem->>'nonconformity_reason') IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS screening_session_tenant_site_idx
  ON screening_session (tenant_id, site_id);

CREATE INDEX IF NOT EXISTS screening_session_operational_day_idx
  ON screening_session (tenant_id, operational_day_id);

CREATE INDEX IF NOT EXISTS screening_session_status_idx
  ON screening_session (tenant_id, status);

-- Row Level Security
ALTER TABLE screening_session ENABLE ROW LEVEL SECURITY;

CREATE POLICY screening_session_tenant_isolation ON screening_session
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- Unique partial indexes for stockpile_event idempotency (CRI Pitfall 3)
-- Added here so the migration executes in order with the table.
-- stockpile_event table must already exist (from W2-P05 migration).

CREATE UNIQUE INDEX IF NOT EXISTS stockpile_event_crusher_session_uq
  ON stockpile_event ((source_reference->>'crusher_session_id'))
  WHERE source_reference->>'crusher_session_id' IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS stockpile_event_screening_calibre_uq
  ON stockpile_event ((source_reference->>'screening_idempotency_key'))
  WHERE source_reference->>'screening_idempotency_key' IS NOT NULL;
