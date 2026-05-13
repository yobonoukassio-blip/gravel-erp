import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ContractType = 'CDI' | 'CDD' | 'INTERIM';

/**
 * Employee entity — internal staff + subcontractor employees (RH-01).
 *
 * Unified model: when `subcontractorId` is populated, the employee belongs to
 * a subcontractor company; otherwise they are a direct-hire employee.
 * CHECK (site_id IS NOT NULL OR subcontractor_id IS NOT NULL) enforced at DB level.
 *
 * Soft-delete only — never hard-delete. Archive via `is_active = false`.
 */
@Entity({ name: 'employee' })
@Index('employee_tenant_number_uq', ['tenantId', 'employeeNumber'], {
  unique: true,
  where: '"employee_number" IS NOT NULL',
})
export class Employee {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  /** Direct-hire: populated. Subcontractor-employee: null. */
  @Column({ type: 'uuid', name: 'site_id', nullable: true })
  siteId!: string | null;

  /** Subcontractor-employee: populated. Direct-hire: null. */
  @Column({ type: 'uuid', name: 'subcontractor_id', nullable: true })
  subcontractorId!: string | null;

  @Column({ type: 'varchar', length: 100, name: 'first_name' })
  firstName!: string;

  @Column({ type: 'varchar', length: 100, name: 'last_name' })
  lastName!: string;

  @Column({ type: 'varchar', length: 50, name: 'employee_number', nullable: true })
  employeeNumber!: string | null;

  @Column({ type: 'varchar', length: 10, name: 'contract_type' })
  contractType!: ContractType;

  /** Business role code — not a Keycloak role. E.g. FOREUR, CHAUFFEUR, CHEF_POSTE */
  @Column({ type: 'varchar', length: 50, name: 'role_code' })
  roleCode!: string;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ type: 'date', name: 'hired_date', nullable: true })
  hiredDate!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at_utc' })
  createdAtUtc!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at_utc' })
  updatedAtUtc!: Date;

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy!: string;
}
