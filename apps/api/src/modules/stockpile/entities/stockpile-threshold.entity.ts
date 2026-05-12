import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * StockpileThreshold — per (stockpile, calibre) low/critical_low/high band.
 *
 * On every balance projection update, the projection handler checks whether
 * the new balance has *crossed* a threshold and emits
 * `production.stockpile.threshold_crossed` exactly once per crossing.
 */
@Entity({ name: 'stockpile_threshold' })
@Index(
  'stockpile_threshold_uq',
  ['tenantId', 'stockpileId', 'calibreCode'],
  { unique: true },
)
export class StockpileThreshold {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'stockpile_id' })
  stockpileId!: string;

  @Column({ type: 'varchar', length: 50, name: 'calibre_code' })
  calibreCode!: string;

  @Column({ type: 'bigint', name: 'critical_low_kg' })
  criticalLowKg!: string;

  @Column({ type: 'bigint', name: 'low_kg' })
  lowKg!: string;

  @Column({ type: 'bigint', name: 'high_kg' })
  highKg!: string;

  @Column({ type: 'uuid', name: 'updated_by' })
  updatedBy!: string;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
