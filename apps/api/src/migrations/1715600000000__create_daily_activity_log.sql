-- W2-P03-T01 — daily_activity_log + user_preferences.
-- Source: D-10, D-11, D-12, D-14.
--
-- daily_activity_log: append_only_event. server-side ordering via BIGSERIAL `sequence`.
-- user_preferences:   last_write_wins target (sync replica). Canonical user-locale
--                     source-of-truth lives in `users.preferred_locale` (W2-P04);
--                     this replica row is reconciled via CDC.
--
-- Both tables are tenant-scoped with FORCE RLS, mirroring the W1-P02 pattern.

CREATE TABLE daily_activity_log (
  id                    UUID PRIMARY KEY,                    -- client-assigned UUIDv4
  tenant_id             UUID NOT NULL,
  site_id               UUID NOT NULL REFERENCES sites(id),
  shift_id              UUID NULL REFERENCES shifts(id),
  operational_day_id    UUID NULL REFERENCES operational_days(id),
  author_user_id        UUID NOT NULL,
  captured_at_local     TIMESTAMP NOT NULL,                  -- operator-observed local clock
  client_id             TEXT NOT NULL,                       -- stable device id
  client_seq            BIGINT NOT NULL,                     -- monotonic per client (idempotency)
  server_received_at    TIMESTAMPTZ NOT NULL DEFAULT now(),  -- server-stamped (D-14)
  sequence              BIGSERIAL NOT NULL,                  -- canonical ordering (D-14)
  notes                 TEXT NOT NULL CHECK (length(notes) <= 500),
  photo_sha256          TEXT NULL,                           -- optional S3 content-address
  CONSTRAINT daily_activity_log_idem_uq UNIQUE (client_id, client_seq)
);

ALTER TABLE daily_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_activity_log FORCE ROW LEVEL SECURITY;

CREATE POLICY dal_isolation ON daily_activity_log
  FOR ALL TO gravel_app
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY dal_service_bypass ON daily_activity_log
  FOR ALL TO gravel_service
  USING (true)
  WITH CHECK (true);

CREATE INDEX dal_site_seq_idx ON daily_activity_log (site_id, sequence);
CREATE INDEX dal_tenant_seq_idx ON daily_activity_log (tenant_id, sequence);
CREATE INDEX dal_op_day_idx ON daily_activity_log (operational_day_id) WHERE operational_day_id IS NOT NULL;

GRANT SELECT, INSERT ON daily_activity_log TO gravel_app, gravel_service;
GRANT USAGE, SELECT ON SEQUENCE daily_activity_log_sequence_seq TO gravel_app, gravel_service;

-- ---------------------------------------------------------------------------
-- user_preferences — last_write_wins sync replica.
-- ---------------------------------------------------------------------------
CREATE TABLE user_preferences (
  user_id              UUID NOT NULL,
  tenant_id            UUID NOT NULL,
  key                  TEXT NOT NULL,
  value                JSONB NOT NULL,
  client_id            TEXT NOT NULL,
  client_seq           BIGINT NOT NULL,
  server_received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences FORCE ROW LEVEL SECURITY;

CREATE POLICY up_isolation ON user_preferences
  FOR ALL TO gravel_app
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY up_service_bypass ON user_preferences
  FOR ALL TO gravel_service
  USING (true)
  WITH CHECK (true);

CREATE INDEX up_tenant_idx ON user_preferences (tenant_id);
CREATE INDEX up_received_idx ON user_preferences (server_received_at);

GRANT SELECT, INSERT, UPDATE ON user_preferences TO gravel_app, gravel_service;
