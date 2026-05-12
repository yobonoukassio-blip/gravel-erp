import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AlertStatus = 'open' | 'acked' | 'resolved';

/**
 * Persistent alert (D2-74). Web-only entity — never synced to mobile.
 */
@Entity({ name: 'alert' })
@Index('idx_alert_tenant_site_status', ['tenantId', 'siteId', 'status'])
export class Alert {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId!: string;

  @Column({ type: 'varchar', length: 150, name: 'source_event_type' })
  sourceEventType!: string;

  @Column({ type: 'varchar', length: 200, name: 'source_event_id', nullable: true })
  sourceEventId?: string | null;

  @Column({ type: 'varchar', length: 300, name: 'dedupe_key', nullable: true })
  dedupeKey?: string | null;

  @Column({ type: 'varchar', length: 20 })
  severity!: AlertSeverity;

  @Column({ type: 'varchar', length: 20, default: 'open' })
  status!: AlertStatus;

  @Column({ type: 'uuid', array: true, default: () => `'{}'::uuid[]` })
  recipients!: string[];

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'timestamptz', name: 'channel_email_sent_at', nullable: true })
  channelEmailSentAt?: Date | null;

  @Column({ type: 'timestamptz', name: 'created_at_utc', default: () => 'now()' })
  createdAtUtc!: Date;

  @Column({ type: 'timestamptz', name: 'acked_at_utc', nullable: true })
  ackedAtUtc?: Date | null;

  @Column({ type: 'uuid', name: 'acked_by', nullable: true })
  ackedBy?: string | null;

  @Column({ type: 'timestamptz', name: 'resolved_at_utc', nullable: true })
  resolvedAtUtc?: Date | null;

  @Column({ type: 'uuid', name: 'resolved_by', nullable: true })
  resolvedBy?: string | null;
}
