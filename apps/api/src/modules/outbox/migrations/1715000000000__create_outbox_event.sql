-- 1715000000000__create_outbox_event.sql
-- Phase 2 Wave 0 — transactional outbox pattern (D2-35)
--
-- Pattern: business writes + outbox row committed in the same tx.
-- A BullMQ worker drains `outbox_event WHERE dispatched_at_utc IS NULL`
-- and re-emits to NestJS EventEmitter2 channels. At-least-once delivery;
-- consumers must be idempotent.

CREATE TABLE IF NOT EXISTS outbox_event (
  id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           UUID         NOT NULL,
  aggregate_type      VARCHAR(100) NOT NULL,
  aggregate_id        UUID         NOT NULL,
  event_type          VARCHAR(150) NOT NULL,
  payload             JSONB        NOT NULL,
  created_at_utc      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  dispatched_at_utc   TIMESTAMPTZ  NULL,
  attempts            INT          NOT NULL DEFAULT 0,
  last_error          TEXT         NULL
);

-- Partial index — workers scan only pending rows; cheap on hot insert path.
CREATE INDEX IF NOT EXISTS idx_outbox_pending
  ON outbox_event (created_at_utc)
  WHERE dispatched_at_utc IS NULL;

-- Tenant + aggregate lookups (debugging, dead-letter inspection)
CREATE INDEX IF NOT EXISTS idx_outbox_tenant_aggregate
  ON outbox_event (tenant_id, aggregate_type, aggregate_id);

-- RLS — per ADR-0001. Every Phase 2 table inherits the same pattern.
ALTER TABLE outbox_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_event FORCE ROW LEVEL SECURITY;

CREATE POLICY outbox_event_tenant_isolation ON outbox_event
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- Dead-letter table — events exceeding max attempts move here for ops review.
CREATE TABLE IF NOT EXISTS outbox_event_dead_letter (
  id                  UUID         PRIMARY KEY,
  tenant_id           UUID         NOT NULL,
  aggregate_type      VARCHAR(100) NOT NULL,
  aggregate_id        UUID         NOT NULL,
  event_type          VARCHAR(150) NOT NULL,
  payload             JSONB        NOT NULL,
  attempts            INT          NOT NULL,
  last_error          TEXT         NULL,
  moved_to_dlq_at_utc TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE outbox_event_dead_letter ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_event_dead_letter FORCE ROW LEVEL SECURITY;

CREATE POLICY outbox_dlq_tenant_isolation ON outbox_event_dead_letter
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
