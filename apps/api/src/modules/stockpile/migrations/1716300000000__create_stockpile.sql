-- 1716300000000__create_stockpile.sql
-- Phase 02 W2 P05 — Stockpile master row (D2-40).

CREATE TABLE stockpile (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id               UUID NOT NULL,
    site_id                 UUID NOT NULL,
    zone_id                 UUID NOT NULL REFERENCES zone(id),
    code                    VARCHAR(50) NOT NULL,
    label                   VARCHAR(200) NOT NULL,
    default_calibre_code    VARCHAR(50) NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT stockpile_tenant_site_code_uq UNIQUE (tenant_id, site_id, code)
);

CREATE INDEX stockpile_tenant_site_idx ON stockpile (tenant_id, site_id);
CREATE INDEX stockpile_zone_idx        ON stockpile (zone_id);

ALTER TABLE stockpile ENABLE ROW LEVEL SECURITY;
CREATE POLICY stockpile_tenant_iso ON stockpile
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
