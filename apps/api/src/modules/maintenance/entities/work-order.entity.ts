import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type WorkOrderType = 'corrective' | 'preventive';
export type WorkOrderStatus = 'open' | 'in_progress' | 'closed' | 'cancelled';

/**
 * WorkOrder (MNT-03) — corrective or preventive maintenance intervention.
 * Tracks downtime, labor hours, spare parts consumed (via spare_part_consumption rows).
 * Opening a WO transitions production_equipment.status to MAINTENANCE.
 * Closing refreshes equipment_availability MTBF/MTTR projection.
 */
@Entity({ name: 'work_order' })
@Index('work_order_tenant_equipment_idx', ['tenantId', 'equipmentId'])
@Index('work_order_status_idx', ['tenantId', 'status'])
export class WorkOrder {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId!: string;

  @Column({ type: 'uuid', name: 'equipment_id' })
  equipmentId!: string;

  @Column({ type: 'enum', enum: ['corrective', 'preventive'] })
  type!: WorkOrderType;

  @Column({
    type: 'enum',
    enum: ['open', 'in_progress', 'closed', 'cancelled'],
    default: 'open',
  })
  status!: WorkOrderStatus;

  @Column({ type: 'text', nullable: true })
  diagnosis!: string | null;

  @Column({ type: 'text', nullable: true })
  resolution!: string | null;

  @Column({ type: 'uuid', name: 'pm_plan_id', nullable: true })
  pmPlanId!: string | null;

  @Column({ type: 'uuid', name: 'technician_id', nullable: true })
  technicianId!: string | null;

  @Column({ type: 'int', name: 'downtime_minutes', default: 0 })
  downtimeMinutes!: number;

  @Column({ type: 'numeric', precision: 8, scale: 2, name: 'labor_hours', default: 0 })
  laborHours!: string;

  @Column({ type: 'timestamptz', name: 'opened_at_utc' })
  openedAtUtc!: Date;

  @Column({ type: 'timestamptz', name: 'closed_at_utc', nullable: true })
  closedAtUtc!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
