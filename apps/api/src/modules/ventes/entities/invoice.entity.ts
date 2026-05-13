import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'cancelled';

/**
 * Invoice (VTE-04) — generated from one or more signed BLs.
 * Multi-currency with FX rate frozen at BL delivery_date.
 * IMMUTABLE after status=SENT.
 */
@Entity({ name: 'invoice' })
@Index('invoice_tenant_number_uq', ['tenantId', 'number'], { unique: true })
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 50 })
  number!: string;

  @Column({ type: 'uuid', name: 'customer_id' })
  customerId!: string;

  @Column({ type: 'uuid', array: true, name: 'bl_ids', default: () => `'{}'::uuid[]` })
  blIds!: string[];

  @Column({ type: 'bigint', name: 'subtotal_minor_units' })
  subtotalMinorUnits!: string;

  @Column({ type: 'bigint', name: 'total_minor_units' })
  totalMinorUnits!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'numeric', precision: 18, scale: 8, name: 'fx_rate_to_xof', nullable: true })
  fxRateToXof!: string | null;

  @Column({ type: 'bigint', name: 'total_xof_minor_units', nullable: true })
  totalXofMinorUnits!: string | null;

  @Column({ type: 'date', name: 'issue_date' })
  issueDate!: string;

  @Column({
    type: 'enum',
    enum: ['draft', 'sent', 'paid', 'cancelled'],
    default: 'draft',
  })
  status!: InvoiceStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
