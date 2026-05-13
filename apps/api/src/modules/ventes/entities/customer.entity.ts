import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Customer (VTE-01) — CRM léger. */
@Entity({ name: 'customer' })
@Index('customer_tenant_code_uq', ['tenantId', 'code'], { unique: true })
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 3, name: 'default_currency' })
  defaultCurrency!: string;

  @Column({ type: 'int', name: 'payment_terms_days', default: 30 })
  paymentTermsDays!: number;

  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  contacts!: unknown;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
