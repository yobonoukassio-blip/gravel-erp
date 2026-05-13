-- Phase 05: IoT 3-layer model (raw / validated / business).

-- Layer 1: RAW — untouched ingestion, hypertable candidate
CREATE TABLE IF NOT EXISTS iot_reading_raw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  site_id UUID,
  device_id VARCHAR(100) NOT NULL,
  sensor_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  observed_at_utc TIMESTAMPTZ NOT NULL,
  data_quality_flag VARCHAR(20) NOT NULL DEFAULT 'unvalidated'
    CHECK (data_quality_flag IN ('unvalidated','valid','invalid','suspect')),
  received_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS iot_raw_tenant_device_ts_idx
  ON iot_reading_raw (tenant_id, device_id, observed_at_utc DESC);
ALTER TABLE iot_reading_raw ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS iot_raw_tenant_isolation ON iot_reading_raw
  USING (tenant_id::text = current_setting('app.current_tenant', true));

-- Convert to Timescale hypertable if extension installed (no-op otherwise)
DO $$ BEGIN
  PERFORM 1 FROM pg_extension WHERE extname = 'timescaledb';
  IF FOUND THEN
    PERFORM create_hypertable('iot_reading_raw', 'observed_at_utc', if_not_exists => TRUE, migrate_data => TRUE);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Layer 2: VALIDATED — typed + sanity checked, ready for business consumption
CREATE TABLE IF NOT EXISTS iot_reading_validated (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  site_id UUID,
  device_id VARCHAR(100) NOT NULL,
  sensor_type VARCHAR(50) NOT NULL,
  value NUMERIC(14, 4),
  unit VARCHAR(20),
  latitude NUMERIC(10, 6),
  longitude NUMERIC(10, 6),
  observed_at_utc TIMESTAMPTZ NOT NULL,
  data_quality_flag VARCHAR(20) NOT NULL
    CHECK (data_quality_flag IN ('valid','invalid','suspect')),
  invalid_reason TEXT
);
CREATE INDEX IF NOT EXISTS iot_val_tenant_device_ts_idx
  ON iot_reading_validated (tenant_id, device_id, observed_at_utc DESC);
ALTER TABLE iot_reading_validated ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS iot_val_tenant_isolation ON iot_reading_validated
  USING (tenant_id::text = current_setting('app.current_tenant', true));

-- Edge gateway buffer state — tracks last sync per device
CREATE TABLE IF NOT EXISTS iot_gateway_state (
  device_id VARCHAR(100) NOT NULL,
  tenant_id UUID NOT NULL,
  last_sync_at_utc TIMESTAMPTZ,
  buffer_messages_pending INT NOT NULL DEFAULT 0,
  gateway_online BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, device_id)
);
ALTER TABLE iot_gateway_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS iot_gateway_state_tenant_isolation ON iot_gateway_state
  USING (tenant_id::text = current_setting('app.current_tenant', true));
