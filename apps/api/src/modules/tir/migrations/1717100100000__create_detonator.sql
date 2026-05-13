-- Migration: create_detonator
-- TIR-02: Detonator serial tracking from receipt to use.
-- Exactly 5 tracking fields: serial_number, status, received_in_event_id, blast_charge_id, destroyed_at_utc.

CREATE TYPE detonator_status AS ENUM (
  'IN_STOCK',
  'LOADED',
  'FIRED',
  'RETURNED',
  'DESTROYED'
);

CREATE TABLE IF NOT EXISTS detonator (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL,
  serial_number         VARCHAR(100) NOT NULL,
  status                detonator_status NOT NULL DEFAULT 'IN_STOCK',
  -- Reference to the EXPLOSIVES_IN event that registered this detonator.
  -- Note: explosives_event has composite PK (id, occurred_at_utc) due to partitioning.
  -- We store the event UUID only; referential integrity is enforced at service layer
  -- because Postgres FK to partitioned table composite PK requires the partition column.
  received_in_event_id  UUID NOT NULL,
  blast_charge_id       UUID NULL,              -- set when status = LOADED
  destroyed_at_utc      TIMESTAMPTZ NULL,       -- set when status = DESTROYED
  created_at_utc        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, serial_number)
);

CREATE INDEX IF NOT EXISTS idx_detonator_blast_charge
  ON detonator (blast_charge_id) WHERE blast_charge_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_detonator_status
  ON detonator (tenant_id, status);

COMMENT ON COLUMN detonator.received_in_event_id IS
  'UUID of the explosives_event that received this detonator. '
  'No DB-level FK due to composite PK on partitioned parent table. '
  'Service layer validates existence before insert.';
