import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * CertificationType entity (RH-04).
 *
 * Phase 3 seed codes per PLAN:
 *   PERMIS_EXPLOSIFS, CONDUITE_ENGIN_FOREUSE, CONDUITE_ENGIN_PELLE,
 *   CONDUITE_ENGIN_CAMION, FORMATION_HSE, CONDUITE_CHARGEUR
 *
 * Soft-delete only — archive via `is_active = false`.
 */
@Entity({ name: 'certification_type' })
@Index('certification_type_tenant_code_uq', ['tenantId', 'code'], { unique: true })
export class CertificationType {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  /** Business code. Unique per tenant. */
  @Column({ type: 'varchar', length: 50, name: 'code' })
  code!: string;

  @Column({ type: 'varchar', length: 200, name: 'label' })
  label!: string;

  @Column({ type: 'char', length: 2, name: 'country_iso2' })
  countryIso2!: string;

  @Column({ type: 'varchar', length: 200, name: 'issuing_authority', nullable: true })
  issuingAuthority!: string | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at_utc' })
  createdAtUtc!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at_utc' })
  updatedAtUtc!: Date;
}
