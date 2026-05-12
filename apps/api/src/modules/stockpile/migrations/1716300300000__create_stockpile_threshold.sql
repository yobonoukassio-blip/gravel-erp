-- 1716300300000__create_stockpile_threshold.sql
-- Phase 02 W2 P05 — Threshold configuration per (stockpile, calibre) (D2-42).

CREATE TABLE stockpile_threshold (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL,
    stockpile_id        UUID NOT NULL REFERENCES stockpile(id),
    calibre_code        VARCHAR(50) NOT NULL,
    critical_low_kg     BIGINT NOT NULL,
    low_kg              BIGINT NOT NULL,
    high_kg             BIGINT NOT NULL,
    updated_by          UUID NOT NULL,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT stockpile_threshold_band CHECK (critical_low_kg < low_kg AND low_kg < high_kg),
    CONSTRAINT stockpile_threshold_uq UNIQUE (tenant_id, stockpile_id, calibre_code)
);

ALTER TABLE stockpile_threshold ENABLE ROW LEVEL SECURITY;
CREATE POLICY stockpile_threshold_tenant_iso ON stockpile_threshold
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
