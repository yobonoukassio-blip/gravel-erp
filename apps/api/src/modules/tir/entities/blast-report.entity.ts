/**
 * BlastReport entity — TIR-06.
 *
 * Append-only (BEFORE UPDATE/DELETE trigger raises restrict_violation).
 * Chain-of-hash: row_hash = sha256(prev_hash || buildCanonicalPayload(...))
 * Registered in EventChainVerifier with frozen canonical payload (ADR-0012).
 */
export interface BlastReport {
  id: string;
  occurredAtUtc: Date;
  tenantId: string;
  siteId: string;
  blastPlanId: string;
  fragmentationObs: string;
  vibrationMmS: string | null;
  /** UUIDs of related HSE incidents */
  incidentIds: string[];
  reporterId: string;
  notesMd: string | null;
  prevHash: Buffer;
  rowHash: Buffer;
  createdAtUtc: Date;
}
