-- Migration: create_hse_attachment
-- Phase 2 W3 P07 — HSE-01 (D2-61, ADR-0008)
-- Content-addressed S3 Object Lock attachment registry.

CREATE TABLE hse_attachment (
  id               UUID        NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id        UUID        NOT NULL,
  incident_id      UUID        NOT NULL REFERENCES hse_incident(id),
  sha256_hex       VARCHAR(64) NOT NULL,
  s3_bucket        VARCHAR(100) NOT NULL,
  s3_object_key    VARCHAR(200) NOT NULL,
  content_type     VARCHAR(100) NOT NULL,
  size_bytes       BIGINT      NOT NULL,
  uploaded_by      UUID        NOT NULL,
  uploaded_at_utc  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT hse_attachment_pkey PRIMARY KEY (id),
  -- Prevent duplicate photos for the same incident.
  CONSTRAINT hse_attachment_unique_sha UNIQUE (tenant_id, incident_id, sha256_hex)
);

-- S3 Object Lock is enforced at bucket level (GOVERNANCE mode, 7-year retain).
-- See infra/modules/s3-objectlock/main.tf (W0-P01).

-- Indexes.
CREATE INDEX hse_attachment_incident_idx ON hse_attachment (tenant_id, incident_id);
CREATE INDEX hse_attachment_sha256_idx   ON hse_attachment (tenant_id, sha256_hex);

-- Row-Level Security.
ALTER TABLE hse_attachment ENABLE ROW LEVEL SECURITY;

CREATE POLICY hse_attachment_tenant_isolation ON hse_attachment
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid);
