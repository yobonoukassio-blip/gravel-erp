import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Transactional outbox row. D2-35.
 *
 * Inserted by business services inside the *same* transaction as the
 * domain mutation. A BullMQ worker drains pending rows (where
 * `dispatched_at_utc IS NULL`) and re-emits via EventEmitter2.
 *
 * NOT a sync-mobile entity — backend-only. No @SyncEntity decoration.
 */
@Entity({ name: 'outbox_event' })
@Index('idx_outbox_tenant_aggregate', ['tenantId', 'aggregateType', 'aggregateId'])
export class OutboxEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 100, name: 'aggregate_type' })
  aggregateType!: string;

  @Column({ type: 'uuid', name: 'aggregate_id' })
  aggregateId!: string;

  @Column({ type: 'varchar', length: 150, name: 'event_type' })
  eventType!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'timestamptz', name: 'created_at_utc', default: () => 'now()' })
  createdAtUtc!: Date;

  @Column({ type: 'timestamptz', name: 'dispatched_at_utc', nullable: true })
  dispatchedAtUtc?: Date | null;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ type: 'text', name: 'last_error', nullable: true })
  lastError?: string | null;
}
