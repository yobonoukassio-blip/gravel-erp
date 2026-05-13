import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type EnergyUsageType = 'concassage' | 'criblage' | 'ateliers' | 'bureaux';

/**
 * EnergyConsumptionReading (CAR-04) — manual monthly electricity reading.
 *
 * One row per (tenant_id, site_id, year_month, usage_type).
 * Upserted via EnergyConsumptionService.upsert(). Idempotent via
 * the UNIQUE constraint: re-recording the same month/usage overwrites the
 * previous value (last-write-wins per recorded_at_utc).
 */
@Entity({ name: 'energy_consumption_reading' })
@Index('energy_reading_tenant_site_idx', ['tenantId', 'siteId'])
export class EnergyConsumptionReading {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId!: string;

  /** ISO YYYY-MM format. */
  @Column({ type: 'char', length: 7, name: 'year_month' })
  yearMonth!: string;

  @Column({
    type: 'enum',
    enum: ['concassage', 'criblage', 'ateliers', 'bureaux'],
    name: 'usage_type',
    enumName: 'energy_usage_type',
  })
  usageType!: EnergyUsageType;

  /** kWh consumed this month for this usage type. CHECK >= 0. */
  @Column({ type: 'numeric', precision: 10, scale: 2, name: 'kwh' })
  kwh!: string;

  @Column({ type: 'varchar', length: 50, name: 'source_meter_code', nullable: true })
  sourceMeterCode?: string | null;

  @Column({ type: 'uuid', name: 'recorded_by' })
  recordedBy!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'recorded_at_utc' })
  recordedAtUtc!: Date;

  @Column({ type: 'text', name: 'notes', nullable: true })
  notes?: string | null;
}
