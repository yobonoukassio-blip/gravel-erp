import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * FxRateSnapshot — frozen FX rate per (tenant, currency_from, currency_to, date).
 * Inserted ON CONFLICT DO NOTHING — immutable once snapshotted (W3-P06 invoice depends on this).
 */
@Entity({ name: 'fx_rate_snapshot' })
@Index('fx_snapshot_uq', ['tenantId', 'currencyFrom', 'currencyTo', 'snapshotDate'], {
  unique: true,
})
export class FxRateSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 3, name: 'currency_from' })
  currencyFrom!: string;

  @Column({ type: 'varchar', length: 3, name: 'currency_to' })
  currencyTo!: string;

  // rate stored as numeric with 8 decimals for precision (still queried as bigint math at invoice time)
  @Column({ type: 'numeric', precision: 18, scale: 8 })
  rate!: string;

  @Column({ type: 'date', name: 'snapshot_date' })
  snapshotDate!: string;

  @Column({ type: 'varchar', length: 50 })
  source!: string;
}
