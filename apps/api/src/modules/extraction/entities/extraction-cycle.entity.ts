import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SyncEntity } from '../../sync/registry';

export type MaterialType = 'granite_brut' | 'tout_venant' | 'sterile';
export type DowntimeReasonCode =
  | 'meal_break'
  | 'fuel'
  | 'mechanical'
  | 'weather'
  | 'safety'
  | 'other';

export const MATERIAL_TYPE_VALUES: ReadonlyArray<MaterialType> = [
  'granite_brut',
  'tout_venant',
  'sterile',
];

export const DOWNTIME_REASON_VALUES: ReadonlyArray<DowntimeReasonCode> = [
  'meal_break',
  'fuel',
  'mechanical',
  'weather',
  'safety',
  'other',
];

/**
 * ExtractionCycle (D2-20).
 *
 * Append-only event entity — captured on mobile by excavator/loader operators.
 * Corrections land as NEW rows with `corrects_id` FK (mirror of DrilledHole).
 *
 * D2-21: `estimated_tonnage_t` is EXPLICITLY estimated. The authoritative
 * tonnage for stockpile valuation comes from the W2-P04 weighing ticket — DO
 * NOT use this column for value-impacting reporting.
 */
@SyncEntity({ strategy: 'append_only_event' })
@Entity({ name: 'extraction_cycle' })
@Index('extraction_cycle_tenant_day_idx', ['tenantId', 'operationalDayId'])
@Index('extraction_cycle_tenant_equipment_idx', ['tenantId', 'equipmentId'])
export class ExtractionCycle {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId!: string;

  @Column({ type: 'uuid', name: 'operational_day_id' })
  operationalDayId!: string;

  @Column({ type: 'uuid', name: 'bench_id' })
  benchId!: string;

  @Column({ type: 'uuid', name: 'equipment_id' })
  equipmentId!: string;

  @Column({ type: 'uuid', name: 'operator_id' })
  operatorId!: string;

  @Column({
    type: 'enum',
    enum: MATERIAL_TYPE_VALUES as unknown as string[],
    name: 'material_type',
  })
  materialType!: MaterialType;

  @Column({
    type: 'numeric',
    precision: 7,
    scale: 1,
    name: 'estimated_tonnage_t',
    transformer: {
      to: (v: number) => v,
      from: (v: string | number | null) =>
        v === null ? 0 : typeof v === 'string' ? Number.parseFloat(v) : v,
    },
  })
  estimatedTonnageT!: number;

  @Column({ type: 'timestamp', name: 'cycle_started_at_local' })
  cycleStartedAtLocal!: Date;

  @Column({ type: 'timestamp', name: 'cycle_ended_at_local' })
  cycleEndedAtLocal!: Date;

  @Column({ type: 'varchar', length: 64, name: 'iana_timezone' })
  ianaTimezone!: string;

  @Column({ type: 'int', name: 'downtime_minutes', nullable: true })
  downtimeMinutes!: number | null;

  @Column({
    type: 'enum',
    enum: DOWNTIME_REASON_VALUES as unknown as string[],
    name: 'downtime_reason_code',
    nullable: true,
  })
  downtimeReasonCode!: DowntimeReasonCode | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'uuid', name: 'corrects_id', nullable: true })
  correctsId!: string | null;

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at_utc' })
  createdAtUtc!: Date;
}
