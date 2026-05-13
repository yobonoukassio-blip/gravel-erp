import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

export type FuelTankEventType =
  | 'FUEL_DELIVERY_IN'
  | 'FUEL_DISPENSE_OUT'
  | 'FUEL_ADJUSTMENT'
  | 'FUEL_RECONCILIATION';

/**
 * FuelTankEvent (D2-50, CAR-01, ADR-0007) — append-only event ledger.
 *
 * Server rejects PATCH / DELETE at controller + DB trigger layers.
 * Each row carries a chain-of-hash (sha256) — see EventChainVerifier.
 *
 * Table is PARTITIONED BY RANGE (occurred_at_utc) — monthly partitions.
 * Primary key is composite (id, occurred_at_utc) because Postgres requires
 * the partitioning column to appear in any unique constraint.
 *
 * liters_delta is signed:
 *   FUEL_DELIVERY_IN  > 0
 *   FUEL_DISPENSE_OUT < 0
 *   FUEL_ADJUSTMENT   signed
 *   FUEL_RECONCILIATION = 0 (informational only, does NOT correct stock)
 */
@Entity({ name: 'fuel_tank_event' })
@Index('fuel_tank_event_tenant_time_idx', ['tenantId', 'occurredAtUtc'])
@Index('fuel_tank_event_tank_idx', ['tankId', 'occurredAtUtc'])
@Index('fuel_tank_event_op_day_idx', ['operationalDayId'])
export class FuelTankEvent {
  @PrimaryColumn({ type: 'uuid', name: 'id' })
  id!: string;

  @PrimaryColumn({ type: 'timestamptz', name: 'occurred_at_utc' })
  occurredAtUtc!: Date;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId!: string;

  @Column({ type: 'uuid', name: 'tank_id' })
  tankId!: string;

  @Column({
    type: 'enum',
    enum: ['FUEL_DELIVERY_IN', 'FUEL_DISPENSE_OUT', 'FUEL_ADJUSTMENT', 'FUEL_RECONCILIATION'],
    name: 'event_type',
    enumName: 'fuel_tank_event_type',
  })
  eventType!: FuelTankEventType;

  /** Signed NUMERIC(10,2) in litres. DELIVERY_IN > 0; DISPENSE_OUT < 0. */
  @Column({ type: 'numeric', precision: 10, scale: 2, name: 'liters_delta' })
  litersDelta!: string;

  @Column({ type: 'uuid', name: 'operational_day_id' })
  operationalDayId!: string;

  @Column({ type: 'jsonb', name: 'source_reference', default: () => `'{}'::jsonb` })
  sourceReference!: Record<string, unknown>;

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy!: string;

  @Column({ type: 'bytea', name: 'prev_hash' })
  prevHash!: Buffer;

  @Column({ type: 'bytea', name: 'row_hash' })
  rowHash!: Buffer;

  @Column({ type: 'bigint', name: 'cost_per_liter_minor_units', nullable: true })
  costPerLiterMinorUnits?: string | null;

  @Column({ type: 'char', length: 3, name: 'currency', nullable: true })
  currency?: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at_utc' })
  createdAtUtc!: Date;
}
