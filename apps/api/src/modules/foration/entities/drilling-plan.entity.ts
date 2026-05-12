import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SyncEntity } from '../../sync/registry';

export type DrillingPlanStatus = 'draft' | 'active' | 'closed' | 'archived';

/**
 * DrillingPlan (D2-10) — site-scoped plan of holes to drill in a bench.
 *
 * Sync strategy: `pessimistic_lock` — mutable on web, web-only edit surface
 * (Chef Carrière), short edit windows, last-writer-wins is unacceptable for
 * plan parameters (depth/diameter changes mid-shift cause real cost).
 */
@SyncEntity({ strategy: 'pessimistic_lock' })
@Entity({ name: 'drilling_plan' })
@Index('drilling_plan_tenant_site_idx', ['tenantId', 'siteId'])
@Index('drilling_plan_bench_idx', ['benchId'])
export class DrillingPlan {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId!: string;

  @Column({ type: 'uuid', name: 'zone_id' })
  zoneId!: string;

  @Column({ type: 'uuid', name: 'bench_id' })
  benchId!: string;

  @Column({ type: 'integer', name: 'planned_hole_count' })
  plannedHoleCount!: number;

  @Column({ type: 'numeric', precision: 6, scale: 2, name: 'target_depth_m' })
  targetDepthM!: string;

  @Column({ type: 'integer', name: 'diameter_mm' })
  diameterMm!: number;

  @Column({ type: 'uuid', name: 'assigned_operator_id', nullable: true })
  assignedOperatorId?: string | null;

  @Column({ type: 'uuid', name: 'assigned_machine_id', nullable: true })
  assignedMachineId?: string | null;

  @Column({ type: 'timestamptz', name: 'valid_from' })
  validFrom!: Date;

  @Column({ type: 'timestamptz', name: 'valid_to', nullable: true })
  validTo?: Date | null;

  @Column({
    type: 'enum',
    enum: ['draft', 'active', 'closed', 'archived'],
    enumName: 'drilling_plan_status',
    default: 'draft',
  })
  status!: DrillingPlanStatus;

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @Column({ type: 'uuid', name: 'closed_by', nullable: true })
  closedBy?: string | null;

  @Column({ type: 'timestamptz', name: 'closed_at_utc', nullable: true })
  closedAtUtc?: Date | null;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
