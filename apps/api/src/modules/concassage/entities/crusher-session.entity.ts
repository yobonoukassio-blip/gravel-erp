/**
 * CrusherSession entity (CON-01, CON-02).
 *
 * Mutable operational record — NOT append-only. No chain-of-hash required
 * (ADR-0013: standard FND-06 audit trail suffices for operational records).
 * Chain-of-hash is reserved for financial/immutable ledger entries (stockpile_event, BL).
 */
export type CrusherSessionStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED';

export interface CrusherSession {
  id: string;
  tenantId: string;
  siteId: string;
  operationalDayId: string;
  crusherId: string;
  inputZoneId: string | null;
  outputStockpileId: string;
  materialType: string;
  calibreCode: string;
  inputTonnageKg: number;
  outputTonnageKg: number;
  energyKwh: number;
  operatingHours: number;
  /** DB GENERATED ALWAYS AS STORED column — not written by application. */
  performancePct: number;
  sessionStartUtc: Date;
  sessionEndUtc: Date | null;
  operatorId: string;
  status: CrusherSessionStatus;
  notesMd: string | null;
  createdAtUtc: Date;
  updatedAtUtc: Date;
}
