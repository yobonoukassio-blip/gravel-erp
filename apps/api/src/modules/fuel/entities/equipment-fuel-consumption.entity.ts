import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * EquipmentFuelConsumption (D2-51, CAR-02) — one row per EquipmentRefuel.
 *
 * Created atomically alongside the EquipmentRefuel and FUEL_DISPENSE_OUT
 * event in the same transaction by EquipmentRefuelService.create().
 *
 * hours_since_previous is null for the very first refuel of an equipment.
 * cost_per_liter_minor_units is copied from the most recent FUEL_DELIVERY_IN
 * on the same tank within the same operational day window.
 */
@Entity({ name: 'equipment_fuel_consumption' })
@Index('efc_tenant_site_idx', ['tenantId', 'siteId'])
@Index('efc_equipment_idx', ['equipmentId'])
export class EquipmentFuelConsumption {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId!: string;

  @Column({ type: 'uuid', name: 'equipment_id' })
  equipmentId!: string;

  /** 1:1 with EquipmentRefuel — UNIQUE constraint enforces idempotency. */
  @Column({ type: 'uuid', name: 'refuel_id', unique: true })
  refuelId!: string;

  @Column({ type: 'uuid', name: 'operational_day_id' })
  operationalDayId!: string;

  @Column({ type: 'numeric', precision: 7, scale: 2, name: 'liters' })
  liters!: string;

  @Column({ type: 'numeric', precision: 8, scale: 1, name: 'hour_meter_reading' })
  hourMeterReading!: string;

  /** Hours since the previous refuel for the same equipment (null if first). */
  @Column({ type: 'numeric', precision: 7, scale: 2, name: 'hours_since_previous', nullable: true })
  hoursSincePrevious?: string | null;

  @Column({ type: 'bigint', name: 'cost_per_liter_minor_units', nullable: true })
  costPerLiterMinorUnits?: string | null;

  @Column({ type: 'char', length: 3, name: 'currency', nullable: true })
  currency?: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at_utc' })
  createdAtUtc!: Date;
}
