-- 1716300200000__create_stockpile_balance.sql
-- Phase 02 W2 P05 — Materialized balance projection (D2-41).

CREATE TABLE stockpile_balance (
    tenant_id                              UUID NOT NULL,
    site_id                                UUID NOT NULL,
    stockpile_id                           UUID NOT NULL REFERENCES stockpile(id),
    calibre_code                           VARCHAR(50) NOT NULL,
    balance_kg                             BIGINT NOT NULL DEFAULT 0,
    last_event_id                          UUID NULL,
    last_refresh_utc                       TIMESTAMPTZ NOT NULL DEFAULT now(),
    weighted_avg_cost_per_ton_minor_units  BIGINT NOT NULL DEFAULT 0,
    currency                               CHAR(3) NULL,
    PRIMARY KEY (tenant_id, stockpile_id, calibre_code)
);

CREATE INDEX stockpile_balance_site_idx ON stockpile_balance (tenant_id, site_id);

ALTER TABLE stockpile_balance ENABLE ROW LEVEL SECURITY;
CREATE POLICY stockpile_balance_tenant_iso ON stockpile_balance
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
