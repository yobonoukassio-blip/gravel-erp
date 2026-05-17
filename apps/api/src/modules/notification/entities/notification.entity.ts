import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * In-app notification (NTF-04). Web-only entity — never synced to mobile
 * (mobile gets its own outbox-based notification stream later).
 *
 * One row per (user, alert) pair. The Angular header reads:
 *   GET /api/notifications?unread=true -> count + latest 10
 *   PATCH /api/notifications/:id/read  -> sets read_at_utc = now()
 */
@Entity({ name: 'notification' })
@Index('idx_notification_user_unread', ['tenantId', 'userId', 'readAtUtc'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'uuid', name: 'alert_id', nullable: true })
  alertId?: string | null;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'varchar', length: 20, default: 'info' })
  severity!: 'info' | 'warning' | 'high' | 'critical';

  @Column({ type: 'varchar', length: 150, name: 'event_type', nullable: true })
  eventType?: string | null;

  @Column({ type: 'timestamptz', name: 'read_at_utc', nullable: true })
  readAtUtc?: Date | null;

  @Column({ type: 'timestamptz', name: 'created_at_utc', default: () => 'now()' })
  createdAtUtc!: Date;
}
