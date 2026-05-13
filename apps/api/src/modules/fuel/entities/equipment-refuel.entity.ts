import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * EquipmentRefuel (D2-51, CAR-02) — append-only refuel record.
 *
 * @SyncEntity({ strategy: 'append_only_event' }) — PowerSync downstream
 * replicates this table to mobile clients that need refuel history.
 *
 * On insert, the EquipmentRefuelService atomically creates in the same tx:
 *   1. This EquipmentRefuel row
 *   2. A FUEL_DISPENSE_OUT fuel_tank_event (negative liters_delta)
 *   3. An EquipmentFuelConsumption row with computed hours_since_previous
 */
@Entity({ name: 'equipment_refuel' })
@Index('equipment_refuel_tenant_site_idx', ['tenantId', 'siteId'])
@Index('equipment_refuel_tank_idx', ['tankId'])
@Index('equipment_refuel_equipment_idx', ['equipmentId'])
export class EquipmentRefuel {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId!: string;

  @Column({ type: 'uuid', name: 'tank_id' })
  tankId!: string;

  @Column({ type: 'uuid', name: 'equipment_id' })
  equipmentId!: string;

  @Column({ type: 'uuid', name: 'operator_id' })
  operatorId!: string;

  /** Litres dispensed. NUMERIC(7,2) CHECK > 0. */
  @Column({ type: 'numeric', precision: 7, scale: 2, name: 'liters' })
  liters!: string;

  /** Running equipment hour meter reading at time of refuel (monotonically non-decreasing). */
  @Column({ type: 'numeric', precision: 8, scale: 1, name: 'equipment_hour_meter_reading' })
  equipmentHourMeterReading!: string;

  /** SHA-256 of the gauge photo blob (optional). */
  @Column({ type: 'varchar', length: 64, name: 'gauge_photo_blob_sha256', nullable: true })
  gaugePhotoBlobSha256?: string | null;

  @Column({ type: 'uuid', name: 'operational_day_id' })
  operationalDayId!: string;

  /** Local civil timestamp (without TZ) from the device clock. */
  @Column({ type: 'timestamp', name: 'created_at_local' })
  createdAtLocal!: Date;

  @Column({ type: 'varchar', length: 64, name: 'iana_timezone' })
  ianaTimezone!: string;

  @Column({ type: 'text', name: 'notes', nullable: true })
  notes?: string | null;

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at_utc' })
  createdAtUtc!: Date;
}
