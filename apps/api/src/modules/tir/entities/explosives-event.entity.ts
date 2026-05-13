/**
 * ExplosivesEvent entity — TIR-01.
 *
 * Append-only ledger with SHA-256 chain-of-hash (ADR-0012).
 * Partitioned by occurred_at_utc (RANGE, monthly).
 *
 * CRITICAL invariants:
 *   - BEFORE UPDATE/DELETE trigger raises restrict_violation on mutation
 *   - One-time pdf_sha256 backfill UPDATE is allowed by the trigger when
 *     OLD.pdf_sha256 IS NULL AND NEW.pdf_sha256 IS NOT NULL AND row_hash unchanged
 *   - Chain: row_hash = sha256(prev_hash || buildCanonicalPayload(...))
 */
export type ExplosivesProductType = 'ANFO' | 'EMULSION' | 'DETONATEUR' | 'CORDEAU';
export type ExplosivesEventType =
  | 'EXPLOSIVES_IN'
  | 'EXPLOSIVES_OUT_LOAD'
  | 'EXPLOSIVES_RETURN'
  | 'EXPLOSIVES_DESTROY';

export interface ExplosivesEvent {
  id: string;
  occurredAtUtc: Date;
  tenantId: string;
  siteId: string;
  operationalDayId: string;
  eventType: ExplosivesEventType;
  productType: ExplosivesProductType;
  /** Signed BIGINT grams: positive = IN, negative = OUT */
  quantityG: string;
  unitPriceMinor: string | null;
  currency: string | null;
  supplier: string | null;
  docReference: string | null;
  blastPlanId: string | null;
  /** NULL until async PDF snapshot is uploaded via outbox handler */
  pdfSha256: string | null;
  sourceReference: Record<string, unknown>;
  prevHash: Buffer;
  rowHash: Buffer;
  createdBy: string;
}
