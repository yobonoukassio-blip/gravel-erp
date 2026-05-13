-- Phase 03 W3-P06: Invoice + sequential numbering.

CREATE TABLE IF NOT EXISTS invoice (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  number VARCHAR(50) NOT NULL,
  customer_id UUID NOT NULL REFERENCES customer(id),
  bl_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  subtotal_minor_units BIGINT NOT NULL CHECK (subtotal_minor_units >= 0),
  total_minor_units BIGINT NOT NULL CHECK (total_minor_units >= 0),
  currency CHAR(3) NOT NULL,
  fx_rate_to_xof NUMERIC(18, 8),
  total_xof_minor_units BIGINT,
  issue_date DATE NOT NULL,
  status VARCHAR(15) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number)
);
ALTER TABLE invoice ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS invoice_tenant_isolation ON invoice
  USING (tenant_id::text = current_setting('app.current_tenant', true));

-- Invoice number counter (sequential per tenant)
CREATE TABLE IF NOT EXISTS invoice_counter (
  tenant_id UUID PRIMARY KEY,
  last_number INT NOT NULL DEFAULT 0
);
ALTER TABLE invoice_counter ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS invoice_counter_tenant_isolation ON invoice_counter
  USING (tenant_id::text = current_setting('app.current_tenant', true));

-- IMMUTABILITY: invoice becomes append-only once SENT
CREATE OR REPLACE FUNCTION invoice_block_update_after_sent() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'sent' OR OLD.status = 'paid' THEN
    IF NEW.status NOT IN ('paid', 'cancelled') OR
       OLD.subtotal_minor_units != NEW.subtotal_minor_units OR
       OLD.total_minor_units != NEW.total_minor_units OR
       OLD.fx_rate_to_xof IS DISTINCT FROM NEW.fx_rate_to_xof THEN
      RAISE EXCEPTION 'INVOICE_IMMUTABLE: invoice locked after status=sent' USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS invoice_immutable_trigger ON invoice;
CREATE TRIGGER invoice_immutable_trigger
  BEFORE UPDATE ON invoice
  FOR EACH ROW EXECUTE FUNCTION invoice_block_update_after_sent();
