import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Materialized MTBF/MTTR projection per equipment (rolling 12 months). MNT-05. */
@Entity({ name: 'equipment_availability' })
export class EquipmentAvailability {
  @PrimaryColumn({ type: 'uuid', name: 'equipment_id' })
  equipmentId!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'mtbf_hours', nullable: true })
  mtbfHours!: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, name: 'mttr_hours', nullable: true })
  mttrHours!: string | null;

  @Column({ type: 'int', name: 'failure_count', default: 0 })
  failureCount!: number;

  @Column({ type: 'int', name: 'total_downtime_minutes', default: 0 })
  totalDowntimeMinutes!: number;

  @UpdateDateColumn({ name: 'computed_at_utc', type: 'timestamptz' })
  computedAtUtc!: Date;
}
