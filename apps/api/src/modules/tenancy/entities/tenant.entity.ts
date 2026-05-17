import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Tenant — root of the multi-tenant tree.
 * Source: D-23, D-26.
 *
 * NOTE: this table's own `tenant_id` equals its primary key (generated column in SQL).
 * RLS policy uses the same `current_setting('app.tenant_id')::uuid = tenant_id` predicate
 * uniformly across all tables.
 */
@Entity({ name: 'tenants' })
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'text' })
  code!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', name: 'default_locale', default: 'fr-CI' })
  defaultLocale!: string;

  @Column({ type: 'char', length: 3, name: 'group_pivot_currency', default: 'XOF' })
  groupPivotCurrency!: string;

  @Column({ type: 'text', default: 'active' })
  status!: 'active' | 'archived';

  @Column({ type: 'timestamptz', name: 'archived_at', nullable: true })
  archivedAt?: Date | null;

  /**
   * Compliance contact for the quarterly audit-export cron (HRD-MVP-05, D-16).
   * Nullable: cron filters tenants where this is set.
   */
  @Column({ type: 'varchar', length: 255, name: 'compliance_email', nullable: true })
  complianceEmail?: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
