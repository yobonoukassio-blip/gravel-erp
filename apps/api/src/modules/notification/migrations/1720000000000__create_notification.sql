-- 1720000000000__create_notification.sql
-- Phase 9 Wave 1 — notification delivery (NTF-04).
--
-- In-app notification rows per (user, alert). Powers the Angular header
-- unread-count badge. Web-only entity: not synced to mobile (mobile uses its
-- own outbox flow later).

CREATE TABLE IF NOT EXISTS notification (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID         NOT NULL,
  user_id         UUID         NOT NULL,
  alert_id        UUID         NULL,
  title           VARCHAR(200) NOT NULL,
  body            TEXT         NOT NULL,
  severity        VARCHAR(20)  NOT NULL DEFAULT 'info'
                  CHECK (severity IN ('info','warning','high','critical')),
  event_type      VARCHAR(150) NULL,
  read_at_utc     TIMESTAMPTZ  NULL,
  created_at_utc  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Hot index: header badge polls "unread per user per tenant".
CREATE INDEX IF NOT EXISTS idx_notification_user_unread
  ON notification (tenant_id, user_id, read_at_utc, created_at_utc DESC);

-- Idempotency: at most one notification per (user, alert) pair. NULL alert_id
-- allowed multiple times (non-alert notifications can repeat).
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_user_alert_unique
  ON notification (tenant_id, user_id, alert_id)
  WHERE alert_id IS NOT NULL;

-- RLS — ADR-0001
ALTER TABLE notification ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification FORCE ROW LEVEL SECURITY;

CREATE POLICY notification_tenant_isolation ON notification
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
