import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type AlertChannel = 'email' | 'sms' | 'in_app';
export type AlertSeverity = 'info' | 'warning' | 'critical';

/**
 * AlertRule (DSH-06) — configurable rule routing alerts to channels.
 * Triggered by event type + optional severity filter.
 * Recipients: user_ids[] or role_codes[] resolved at dispatch time.
 *
 * site_id is optional: null means the rule applies to ALL sites in the tenant.
 */
@Entity({ name: 'alert_rule' })
@Index('alert_rule_tenant_event_idx', ['tenantId', 'eventType'])
export class AlertRule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  /** Scope rule to a specific site. NULL = applies to all sites in the tenant. */
  @Column({ type: 'uuid', name: 'site_id', nullable: true })
  siteId!: string | null;

  @Column({ type: 'varchar', length: 100, name: 'event_type' })
  eventType!: string;

  @Column({
    type: 'enum',
    enum: ['info', 'warning', 'critical'],
    name: 'severity_filter',
    nullable: true,
  })
  severityFilter!: AlertSeverity | null;

  @Column({ type: 'varchar', array: true, length: 20, name: 'channels' })
  channels!: AlertChannel[];

  @Column({ type: 'varchar', array: true, length: 50, name: 'role_codes', default: () => `'{}'::varchar[]` })
  roleCodes!: string[];

  @Column({ type: 'uuid', array: true, name: 'user_ids', default: () => `'{}'::uuid[]` })
  userIds!: string[];

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;
}
