import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

export type StockpileEventType =
  | 'STOCKPILE_INFLOW'
  | 'STOCKPILE_OUTFLOW_SALE'
  | 'STOCKPILE_ADJUSTMENT'
  | 'STOCKPILE_TRANSFER';

export type MaterialType = 'granite_brut' | 'tout_venant' | 'sterile';

/**
 * StockpileEvent (D2-40, D2-41, ADR-0006) — append-only event ledger.
 *
 * Server rejects PATCH / DELETE at controller + DB trigger layers.
 * Each row carries a chain-of-hash (sha256) — see EventChainVerifier.
 *
 * Table is PARTITIONED BY RANGE (occurred_at_utc) — monthly partitions.
 * Primary key is composite (id, occurred_at_utc) because Postgres requires
 * the partitioning column to appear in any unique constraint.
 */
@Entity({ name: 'stockpile_event' })
@Index('stockpile_event_tenant_time_idx', ['tenantId', 'occurredAtUtc'])
@Index('stockpile_event_stockpile_idx', ['stockpileId', 'occurredAtUtc'])
@Index('stockpile_event_op_day_idx', ['operationalDayId'])
export class StockpileEvent {
  @PrimaryColumn({ type: 'uuid', name: 'id' })
  id!: string;

  @PrimaryColumn({ type: 'timestamptz', name: 'occurred_at_utc' })
  occurredAtUtc!: Date;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId!: string;

  @Column({ type: 'uuid', name: 'stockpile_id' })
  stockpileId!: string;

  @Column({
    type: 'enum',
    enum: [
      'STOCKPILE_INFLOW',
      'STOCKPILE_OUTFLOW_SALE',
      'STOCKPILE_ADJUSTMENT',
      'STOCKPILE_TRANSFER',
    ],
    name: 'event_type',
    enumName: 'stockpile_event_type',
  })
  eventType!: StockpileEventType;

  /** Signed BIGINT in kg. INFLOW > 0; OUTFLOW/SALE < 0; ADJUSTMENT signed. */
  @Column({ type: 'bigint', name: 'tonnage_delta_kg' })
  tonnageDeltaKg!: string;

  @Column({
    type: 'enum',
    enum: ['granite_brut', 'tout_venant', 'sterile'],
    name: 'material_type',
    enumName: 'material_type_enum',
  })
  materialType!: MaterialType;

  @Column({ type: 'varchar', length: 50, name: 'calibre_code' })
  calibreCode!: string;

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

  @Column({ type: 'bigint', name: 'cost_per_ton_minor_units', nullable: true })
  costPerTonMinorUnits?: string | null;

  @Column({ type: 'char', length: 3, name: 'currency', nullable: true })
  currency?: string | null;

  /** cost_model_version=1 (Phase 2: carburant-only). v2 lands Phase 4. */
  @Column({ type: 'int', name: 'cost_model_version', default: 1 })
  costModelVersion!: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at_utc' })
  createdAtUtc!: Date;
}
