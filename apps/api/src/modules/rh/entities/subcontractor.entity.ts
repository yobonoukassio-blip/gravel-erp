import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Subcontractor entity (RH-01).
 *
 * Represents an external company whose workers operate on Gravel Ivoire sites.
 * Their individual workers are stored as Employee rows with `subcontractor_id` set.
 */
@Entity({ name: 'subcontractor' })
export class Subcontractor {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 200, name: 'company_name' })
  companyName!: string;

  @Column({ type: 'char', length: 2, name: 'country_iso2' })
  countryIso2!: string;

  @Column({ type: 'varchar', length: 100, name: 'contract_reference', nullable: true })
  contractReference!: string | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at_utc' })
  createdAtUtc!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at_utc' })
  updatedAtUtc!: Date;
}
