import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SyncEntity } from '../../sync/registry';

/**
 * DrilledHole (D2-11) — append-only event row per drilled hole.
 *
 * Sync strategy: `append_only_event`. Server REJECTS any UPDATE/DELETE
 * via controller-layer 405 guard. Corrections are NEW rows referencing
 * the original via `corrects_hole_id` (DRILLED_HOLE_CORRECTED semantics).
 */
@SyncEntity({ strategy: 'append_only_event' })
@Entity({ name: 'drilled_hole' })
@Index('drilled_hole_plan_idx', ['planId'])
@Index('drilled_hole_op_day_idx', ['operationalDayId'])
@Index('drilled_hole_machine_idx', ['machineId'])
@Index('drilled_hole_plan_index_uq', ['planId', 'holeIndexInPlan'], {
  unique: true,
})
export class DrilledHole {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId!: string;

  @Column({ type: 'uuid', name: 'plan_id' })
  planId!: string;

  @Column({ type: 'integer', name: 'hole_index_in_plan' })
  holeIndexInPlan!: number;

  /**
   * PostGIS GEOGRAPHY(POINT, 4326) — captured GPS coord at hole.
   * Stored as WKT/GeoJSON-compatible string at the application boundary.
   */
  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
    name: 'gps_point',
    nullable: true,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gpsPoint?: any;

  @Column({
    type: 'numeric',
    precision: 5,
    scale: 1,
    name: 'gps_accuracy_m',
    nullable: true,
  })
  gpsAccuracyM?: string | null;

  @Column({ type: 'numeric', precision: 6, scale: 2, name: 'actual_depth_m' })
  actualDepthM!: string;

  @Column({ type: 'integer', name: 'actual_diameter_mm' })
  actualDiameterMm!: number;

  @Column({
    type: 'numeric',
    precision: 4,
    scale: 1,
    name: 'inclination_deg',
    nullable: true,
  })
  inclinationDeg?: string | null;

  @Column({ type: 'timestamp', name: 'started_at_local' })
  startedAtLocal!: Date;

  @Column({ type: 'timestamp', name: 'ended_at_local' })
  endedAtLocal!: Date;

  @Column({ type: 'varchar', length: 64, name: 'iana_timezone' })
  ianaTimezone!: string;

  @Column({ type: 'uuid', name: 'operational_day_id' })
  operationalDayId!: string;

  @Column({ type: 'uuid', name: 'operator_id' })
  operatorId!: string;

  @Column({ type: 'uuid', name: 'machine_id' })
  machineId!: string;

  /** FOR-04: gasoil consommé pour la session de forage de ce trou. */
  @Column({
    type: 'numeric',
    precision: 7,
    scale: 2,
    name: 'fuel_liters_consumed',
    nullable: true,
  })
  fuelLitersConsumed?: string | null;

  @Column({ type: 'text', name: 'notes_text', nullable: true })
  notesText?: string | null;

  @Column({
    type: 'varchar',
    length: 64,
    name: 'photo_blob_sha256',
    nullable: true,
  })
  photoBlobSha256?: string | null;

  @Column({ type: 'boolean', name: 'tolerance_violation', default: false })
  toleranceViolation!: boolean;

  /** Free-text reason captured on mobile when tolerance violation confirmed. */
  @Column({
    type: 'text',
    name: 'tolerance_violation_reason',
    nullable: true,
  })
  toleranceViolationReason?: string | null;

  @Column({ type: 'uuid', name: 'corrects_hole_id', nullable: true })
  correctsHoleId?: string | null;

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at_utc' })
  createdAtUtc!: Date;
}
