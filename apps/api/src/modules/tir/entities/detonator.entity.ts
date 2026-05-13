/**
 * Detonator entity — TIR-02.
 *
 * Tracks individual detonator serials from receipt to disposal.
 * Exactly 5 tracking fields (no scope creep per plan constraint):
 *   serial_number, status, received_in_event_id, blast_charge_id, destroyed_at_utc.
 */
export type DetonatorStatus = 'IN_STOCK' | 'LOADED' | 'FIRED' | 'RETURNED' | 'DESTROYED';

export interface Detonator {
  id: string;
  tenantId: string;
  serialNumber: string;
  status: DetonatorStatus;
  receivedInEventId: string;
  blastChargeId: string | null;
  destroyedAtUtc: Date | null;
  createdAtUtc: Date;
}
