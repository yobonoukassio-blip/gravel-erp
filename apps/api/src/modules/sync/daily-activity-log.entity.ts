import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * DailyActivityLog — terrain field-entry journal (D-10 round-trip target).
 * append_only_event strategy: every write produces a new row; no UPDATE path.
 *
 * Ordering invariant (D-14): `sequence` (BIGSERIAL) is the only canonical
 * order; `captured_at_local` is display-only and MUST NOT be used for
 * reconciliation ordering.
 */
@Entity({ name: 'daily_activity_log' })
@Index('daily_activity_log_idem_uq', ['clientId', 'clientSeq'], { unique: true })
export class DailyActivityLog {
  /** Client-assigned UUIDv4 (server validates uniqueness). */
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Index()
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId!: string;

  @Column({ type: 'uuid', name: 'shift_id', nullable: true })
  shiftId?: string | null;

  @Column({ type: 'uuid', name: 'operational_day_id', nullable: true })
  operationalDayId?: string | null;

  @Column({ type: 'uuid', name: 'author_user_id' })
  authorUserId!: string;

  @Column({ type: 'timestamp', name: 'captured_at_local' })
  capturedAtLocal!: Date;

  @Column({ type: 'text', name: 'client_id' })
  clientId!: string;

  @Column({ type: 'bigint', name: 'client_seq' })
  clientSeq!: string;

  @Column({ type: 'timestamptz', name: 'server_received_at' })
  serverReceivedAt!: Date;

  @Column({ type: 'bigint' })
  sequence!: string;

  @Column({ type: 'text' })
  notes!: string;

  @Column({ type: 'text', name: 'photo_sha256', nullable: true })
  photoSha256?: string | null;
}
