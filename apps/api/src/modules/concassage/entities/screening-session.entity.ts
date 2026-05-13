/**
 * ScreeningSession entity (CRI-01).
 *
 * Mutable operational record. Reuses the `crusher_session_status` enum type
 * from the Postgres migration (ACTIVE | PAUSED | COMPLETED).
 *
 * calibre_yields schema:
 *   [{calibre_code, output_stockpile_id, tonnage_kg, is_nonconforming, nonconformity_reason}]
 *
 * DB CHECK constraint enforces: every is_nonconforming=true entry must have
 * a non-null nonconformity_reason.
 */
export type ScreeningSessionStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED';

export interface CalibreYield {
  calibre_code: string;
  output_stockpile_id: string;
  tonnage_kg: number;
  is_nonconforming: boolean;
  nonconformity_reason: string | null;
}

export interface ScreeningSession {
  id: string;
  tenantId: string;
  siteId: string;
  operationalDayId: string;
  screenId: string;
  inputStockpileId: string | null;
  sessionStartUtc: Date;
  sessionEndUtc: Date | null;
  inputTonnageKg: number;
  calibreYields: CalibreYield[];
  operatorId: string;
  status: ScreeningSessionStatus;
  notesMd: string | null;
  createdAtUtc: Date;
  updatedAtUtc: Date;
}
