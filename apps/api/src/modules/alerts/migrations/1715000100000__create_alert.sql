-- 1715000100000__create_alert.sql
-- Phase 2 Wave 0 — alerts module scaffold (D2-74).
--
-- Persists alert lifecycle (open | acked | resolved). Web-only entity:
-- not synced to mobile. Consumed by web "Alerts inbox" Phase 2.

CREATE TABLE IF NOT EXISTS alert (
  id                      UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id               UUID         NOT NULL,
  site_id                 UUID         NOT NULL,
  source_event_type       VARCHAR(150) NOT NULL,
  source_event_id         VARCHAR(200) NULL,
  dedupe_key              VARCHAR(300) NULL,
  severity                VARCHAR(20)  NOT NULL
                          CHECK (severity IN ('low','medium','high','critical')),
  status                  VARCHAR(20)  NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open','acked','resolved')),
  recipients              UUID[]       NOT NULL DEFAULT '{}',
  payload                 JSONB        NOT NULL,
  channel_email_sent_at   TIMESTAMPTZ  NULL,
  created_at_utc          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  acked_at_utc            TIMESTAMPTZ  NULL,
  acked_by                UUID         NULL,
  resolved_at_utc         TIMESTAMPTZ  NULL,
  resolved_by             UUID         NULL
);

-- Dedupe of OPEN alerts only. Two open alerts cannot share a dedupe_key
-- within the same tenant — but once one resolves, a new open alert is fine.
CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_open_dedupe
  ON alert (tenant_id, dedupe_key)
  WHERE status = 'open' AND dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_alert_tenant_site_status
  ON alert (tenant_id, site_id, status, created_at_utc DESC);

-- RLS — ADR-0001
ALTER TABLE alert ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert FORCE ROW LEVEL SECURITY;

CREATE POLICY alert_tenant_isolation ON alert
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
