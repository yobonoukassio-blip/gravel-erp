import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type BlStatus = 'draft' | 'pending_signature' | 'signed' | 'cancelled';

/**
 * Bon de Livraison (VTE-03) — delivery note generated on weighing.
 * Offline numbering (client-side): SITE-YYYYMMDD-SEQ
 * Dual signature SHA-256: client + driver hashes mandatory before SIGNED.
 * Content hash freezes BL data at sign time.
 * IMMUTABLE after status=signed (BEFORE UPDATE trigger).
 */
@Entity({ name: 'bon_de_livraison' })
@Index('bl_tenant_number_uq', ['tenantId', 'number'], { unique: true })
export class BonDeLivraison {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId!: string;

  @Column({ type: 'varchar', length: 50 })
  number!: string;

  @Column({ type: 'uuid', name: 'customer_id' })
  customerId!: string;

  @Column({ type: 'uuid', name: 'sale_contract_id' })
  saleContractId!: string;

  @Column({ type: 'uuid', name: 'truck_rotation_id', nullable: true })
  truckRotationId!: string | null;

  @Column({ type: 'uuid', name: 'transporter_id', nullable: true })
  transporterId!: string | null;

  @Column({ type: 'uuid', name: 'stockpile_id' })
  stockpileId!: string;

  @Column({ type: 'varchar', length: 50, name: 'calibre_code' })
  calibreCode!: string;

  @Column({ type: 'numeric', precision: 14, scale: 3, name: 'tonnage_kg' })
  tonnageKg!: string;

  @Column({ type: 'date', name: 'delivery_date' })
  deliveryDate!: string;

  @Column({
    type: 'enum',
    enum: ['draft', 'pending_signature', 'signed', 'cancelled'],
    default: 'draft',
  })
  status!: BlStatus;

  @Column({ type: 'varchar', length: 64, name: 'client_signature_sha256', nullable: true })
  clientSignatureSha256!: string | null;

  @Column({ type: 'varchar', length: 64, name: 'driver_signature_sha256', nullable: true })
  driverSignatureSha256!: string | null;

  @Column({ type: 'varchar', length: 64, name: 'content_sha256', nullable: true })
  contentSha256!: string | null;

  @Column({ type: 'timestamptz', name: 'signed_at_utc', nullable: true })
  signedAtUtc!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
