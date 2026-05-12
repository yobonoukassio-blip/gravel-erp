import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SyncEntity } from '../../sync/registry';

/**
 * WeighingTicket (D2-31, D2-32, D2-33, TRP-02).
 *
 * Phase 2 = pont-bascule MANUAL entry only — no RS232/Modbus.
 * Numbering offline-safe: `<SITE_CODE>-<YYYYMMDD>-<DEVICE_SHORT_ID>-<LOCAL_SEQ>`.
 * `content_hash` = SHA-256 of the canonical JSON payload (see
 * `WeighingTicketService.computeContentHash`) — server verifies on insert.
 * `net_kg` is a Postgres GENERATED ALWAYS AS column (`gross_kg - tare_kg`).
 * Append-only; corrections are NEW rows (Phase 3 WEIGHING_TICKET_CORRECTED).
 */
@SyncEntity({ strategy: 'append_only_event' })
@Entity({ name: 'weighing_ticket' })
@Index('weighing_ticket_tenant_ticket_no_uq', ['tenantId', 'ticketNumber'], {
  unique: true,
})
@Index('weighing_ticket_op_day_idx', ['operationalDayId'])
@Index('weighing_ticket_truck_idx', ['truckEquipmentId'])
export class WeighingTicket {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId!: string;

  @Column({ type: 'varchar', length: 80, name: 'ticket_number' })
  ticketNumber!: string;

  @Column({ type: 'integer', name: 'gross_kg' })
  grossKg!: number;

  @Column({ type: 'integer', name: 'tare_kg' })
  tareKg!: number;

  /** Generated column: net_kg = gross_kg - tare_kg. Read-only at the ORM layer. */
  @Column({
    type: 'integer',
    name: 'net_kg',
    insert: false,
    update: false,
    generatedType: 'STORED',
    asExpression: 'gross_kg - tare_kg',
  })
  netKg!: number;

  @Column({ type: 'uuid', name: 'truck_equipment_id' })
  truckEquipmentId!: string;

  @Column({ type: 'uuid', name: 'driver_id' })
  driverId!: string;

  @Column({
    type: 'enum',
    enum: ['granite_brut', 'tout_venant', 'sterile'],
    name: 'material_type',
  })
  materialType!: 'granite_brut' | 'tout_venant' | 'sterile';

  @Column({ type: 'timestamp', name: 'weighed_at_local' })
  weighedAtLocal!: Date;

  @Column({ type: 'varchar', length: 64, name: 'iana_timezone' })
  ianaTimezone!: string;

  @Column({ type: 'uuid', name: 'operational_day_id' })
  operationalDayId!: string;

  @Column({ type: 'uuid', name: 'operator_user_id' })
  operatorUserId!: string;

  @Column({ type: 'varchar', length: 50, name: 'weighing_station_code' })
  weighingStationCode!: string;

  @Column({
    type: 'varchar',
    length: 64,
    name: 'client_signature_blob_sha256',
    nullable: true,
  })
  clientSignatureBlobSha256?: string | null;

  @Column({
    type: 'varchar',
    length: 64,
    name: 'driver_signature_blob_sha256',
    nullable: true,
  })
  driverSignatureBlobSha256?: string | null;

  @Column({ type: 'text', name: 'notes', nullable: true })
  notes?: string | null;

  @Column({ type: 'boolean', name: 'is_offline_generated', default: false })
  isOfflineGenerated!: boolean;

  /** SHA-256 hex of canonical JSON payload — see WeighingTicketService.computeContentHash. */
  @Column({ type: 'varchar', length: 64, name: 'content_hash' })
  contentHash!: string;

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at_utc' })
  createdAtUtc!: Date;
}
