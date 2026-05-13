import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type PmIntervalUnit = 'hours' | 'km' | 'days';

/** PreventiveMaintenancePlan (MNT-02) — per equipment, interval-based PM schedule. */
@Entity({ name: 'preventive_maintenance_plan' })
@Index('pm_plan_tenant_equipment_idx', ['tenantId', 'equipmentId'])
export class PreventiveMaintenancePlan {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'equipment_id' })
  equipmentId!: string;

  @Column({ type: 'varchar', length: 200 })
  label!: string;

  @Column({ type: 'enum', enum: ['hours', 'km', 'days'] })
  intervalUnit!: PmIntervalUnit;

  @Column({ type: 'int', name: 'interval_value' })
  intervalValue!: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'last_executed_meter', nullable: true })
  lastExecutedMeter!: string | null;

  @Column({ type: 'timestamptz', name: 'last_executed_at_utc', nullable: true })
  lastExecutedAtUtc!: Date | null;

  @Column({ type: 'timestamptz', name: 'next_due_at_utc', nullable: true })
  nextDueAtUtc!: Date | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;
}
