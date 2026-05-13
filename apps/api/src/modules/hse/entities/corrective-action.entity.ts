import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type CapaStatus = 'open' | 'in_progress' | 'done' | 'verified' | 'closed';
export type CapaPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * CorrectiveAction (D2-62, ADR-0008) — CAPA workflow entity.
 *
 * Unlike HseIncident, CorrectiveAction is NOT append-only — status
 * transitions are normal business behavior. Every transition is
 * captured in audit_log via @Auditable decorator (Phase 1 chain).
 *
 * Status machine: open → in_progress → done → verified → closed
 *
 * Blocking rule: HseIncident with severity >= 4 cannot be closed
 * until all its CAPAs reach status='verified'.
 */
@Entity({ name: 'corrective_action' })
@Index('capa_incident_idx', ['tenantId', 'incidentId'])
@Index('capa_status_idx', ['tenantId', 'status'])
@Index('capa_assignee_idx', ['tenantId', 'assignedToUserId'])
export class CorrectiveAction {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'incident_id' })
  incidentId!: string;

  @Column({ type: 'text', name: 'description' })
  description!: string;

  @Column({ type: 'uuid', name: 'assigned_to_user_id' })
  assignedToUserId!: string;

  @Column({ type: 'date', name: 'due_date_local' })
  dueDateLocal!: string;

  @Column({ type: 'varchar', length: 64, name: 'iana_timezone' })
  ianaTimezone!: string;

  @Column({
    type: 'enum',
    enum: ['low', 'medium', 'high', 'critical'],
    name: 'priority',
    enumName: 'capa_priority',
  })
  priority!: CapaPriority;

  @Column({
    type: 'enum',
    enum: ['open', 'in_progress', 'done', 'verified', 'closed'],
    name: 'status',
    enumName: 'capa_status',
    default: 'open',
  })
  status!: CapaStatus;

  /** SHA-256 hex keys of hse_attachment rows submitted as closure evidence. */
  @Column({ type: 'simple-array', name: 'closed_evidence_attachments', default: '' })
  closedEvidenceAttachments!: string[];

  @Column({ type: 'timestamptz', name: 'closed_at_utc', nullable: true })
  closedAtUtc?: Date | null;

  @Column({ type: 'uuid', name: 'closed_by', nullable: true })
  closedBy?: string | null;

  @Column({ type: 'uuid', name: 'verification_user_id', nullable: true })
  verificationUserId?: string | null;

  @Column({ type: 'timestamptz', name: 'verified_at_utc', nullable: true })
  verifiedAtUtc?: Date | null;

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at_utc' })
  createdAtUtc!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at_utc' })
  updatedAtUtc!: Date;
}
