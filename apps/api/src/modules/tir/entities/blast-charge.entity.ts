/**
 * BlastCharge entity — TIR-04.
 *
 * Append-only (BEFORE UPDATE/DELETE trigger raises restrict_violation).
 * variance_pct is a GENERATED column in Postgres; not stored in TS model
 * but returned from query results.
 */
import { ExplosivesProductType } from './explosives-event.entity';

export interface BlastCharge {
  id: string;
  occurredAtUtc: Date;
  tenantId: string;
  blastPlanId: string;
  holeId: string;
  productType: ExplosivesProductType;
  plannedQtyG: string;
  actualQtyG: string;
  /** Computed server-side: ((actual - planned) / planned) * 100, two decimals */
  variancePct: string | null;
  detonatorSerial: string | null;
  operatorId: string;
  createdAtUtc: Date;
}
