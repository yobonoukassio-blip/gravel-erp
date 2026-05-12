import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SyncEntity } from '../../sync/registry';

/**
 * TruckRotation (D2-30, D2-34, D2-35, TRP-01, TRP-03).
 *
 * Append-only. FK to weighing_ticket (NOT NULL) — every rotation is tied
 * to its load-side ticket. `cycle_time_minutes` is a Postgres generated
 * column. Completion (`unloaded_at_utc` set) MUST publish
 * `production.transport.rotation_completed` to outbox in the same tx
 * (D2-35) so P05 stockpile can materialize STOCKPILE_INFLOW.
 */
@SyncEntity({ strategy: 'append_only_event' })
@Entity({ name: 'truck_rotation' })
@Index('truck_rotation_op_day_idx', ['operationalDayId'])
@Index('truck_rotation_truck_idx', ['truckEquipmentId'])
@Index('truck_rotation_weighing_ticket_uq', ['weighingTicketId'], {
  unique: true,
})
export class TruckRotation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId!: string;

  @Column({ type: 'uuid', name: 'operational_day_id' })
  operationalDayId!: string;

  @Column({ type: 'uuid', name: 'truck_equipment_id', nullable: true })
  truckEquipmentId?: string | null;

  @Column({ type: 'uuid', name: 'driver_id', nullable: true })
  driverId?: string | null;

  @Column({ type: 'uuid', name: 'loaded_at_bench_id' })
  loadedAtBenchId!: string;

  @Column({ type: 'uuid', name: 'unloaded_at_zone_id' })
  unloadedAtZoneId!: string;

  @Column({
    type: 'enum',
    enum: ['granite_brut', 'tout_venant', 'sterile'],
    name: 'material_type',
  })
  materialType!: 'granite_brut' | 'tout_venant' | 'sterile';

  @Column({
    type: 'numeric',
    precision: 7,
    scale: 2,
    name: 'loaded_tonnage_t',
  })
  loadedTonnageT!: string;

  @Column({ type: 'uuid', name: 'weighing_ticket_id' })
  weighingTicketId!: string;

  @Column({ type: 'timestamptz', name: 'loaded_at_utc' })
  loadedAtUtc!: Date;

  @Column({ type: 'timestamptz', name: 'unloaded_at_utc', nullable: true })
  unloadedAtUtc?: Date | null;

  /**
   * Generated column. NULL until `unloaded_at_utc` is set.
   * SQL: GENERATED ALWAYS AS (CASE WHEN unloaded_at_utc IS NOT NULL THEN
   *   EXTRACT(EPOCH FROM (unloaded_at_utc - loaded_at_utc))/60.0 END) STORED
   */
  @Column({
    type: 'numeric',
    precision: 7,
    scale: 2,
    name: 'cycle_time_minutes',
    nullable: true,
    insert: false,
    update: false,
  })
  cycleTimeMinutes?: string | null;

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at_utc' })
  createdAtUtc!: Date;
}
