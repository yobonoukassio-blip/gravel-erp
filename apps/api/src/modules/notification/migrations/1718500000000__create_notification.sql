-- NTF-04 — In-app notification table for the web badge.
-- Idempotent / additive.

CREATE TABLE IF NOT EXISTS notification (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  user_id         UUID NOT NULL,
  alert_id        UUID,
  title           VARCHAR(200) NOT NULL,
  body            TEXT NOT NULL,
  severity        VARCHAR(20) NOT NULL DEFAULT 'info',
  event_type      VARCHAR(150),
  read_at_utc     TIMESTAMPTZ,
  created_at_utc  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_user_unread
  ON notification (tenant_id, user_id, read_at_utc);

-- Tenant isolation
ALTER TABLE notification ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'notification_tenant_isolation') THEN
    CREATE POLICY notification_tenant_isolation ON notification
      USING (tenant_id::text = current_setting('app.current_tenant', true));
  END IF;
END $$;
