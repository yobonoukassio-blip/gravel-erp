-- Migration: 1717000600000__alter_operational_day_closure_blockers
-- Add closure_blockers JSONB column to operational_day (used by TIR W1-P02)
-- Phase 3 W0-P01

ALTER TABLE operational_days
  ADD COLUMN IF NOT EXISTS closure_blockers JSONB NOT NULL DEFAULT '[]';

COMMENT ON COLUMN operational_days.closure_blockers IS
  'Array of blocker reason strings. Day closure allowed only when this array is empty. '
  'Append via OperationalDayService.blockClosure(dayId, reason). '
  'Remove via OperationalDayService.resolveClosure(dayId, reason). '
  'Example: ["EXPLOSIVES_RECONCILIATION_PENDING", "OPEN_INCIDENT_SEVERITY_4"]';
