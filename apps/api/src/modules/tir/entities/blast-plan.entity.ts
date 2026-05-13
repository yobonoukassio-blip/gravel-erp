/**
 * BlastPlan entity — TIR-03.
 *
 * Mutable state machine — no append-only trigger (ADR-0012 Pitfall 1).
 * State: DRAFT → HSE_APPROVED → LOADED → FIRE_REQUESTED → CLEARED → FIRED → REPORTED
 */
export type BlastPlanStatus =
  | 'DRAFT'
  | 'HSE_APPROVED'
  | 'LOADED'
  | 'FIRE_REQUESTED'
  | 'CLEARED'
  | 'FIRED'
  | 'REPORTED';

export interface BlastPlan {
  id: string;
  tenantId: string;
  siteId: string;
  operationalDayId: string;
  drillingPlanId: string;
  status: BlastPlanStatus;
  plannedBy: string;
  hseApprovedBy: string | null;
  hseApprovedAtUtc: Date | null;
  loadingOperatorId: string | null;
  loadingApprovedAtUtc: Date | null;
  fireRequestedAtUtc: Date | null;
  clearanceToken: string | null;
  firedAtUtc: Date | null;
  notesMd: string | null;
  version: number;
  createdAtUtc: Date;
  updatedAtUtc: Date;
}
