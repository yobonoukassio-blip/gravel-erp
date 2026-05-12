import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'countries' })
@Index('countries_tenant_iso_uq', ['tenantId', 'isoAlpha2'], { unique: true })
export class Country {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'char', length: 2, name: 'iso_alpha2' })
  isoAlpha2!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'char', length: 3, name: 'default_currency' })
  defaultCurrency!: string;

  @Column({ type: 'text', name: 'default_timezone' })
  defaultTimezone!: string;

  @Column({ type: 'timestamptz', name: 'archived_at', nullable: true })
  archivedAt?: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
