import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * EmployeeCertification entity (RH-04, HSE-04).
 *
 * Schema exactly per docs/phase-03-handoff/hse-rh-deferred-scope.md:
 *   valid_from DATE NOT NULL
 *   valid_to   DATE NOT NULL  (nullable = permanent not used; always explicit end date)
 *   CHECK (valid_to >= valid_from) enforced at DB level.
 *
 * Immutable after creation — corrections must create a new row (same as
 * append-only pattern). No UPDATE/DELETE allowed by RhHabilitationService.
 */
@Entity({ name: 'employee_certification' })
@Index('emp_cert_employee_type_idx', ['tenantId', 'employeeId', 'certificationTypeId'])
export class EmployeeCertification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'employee_id' })
  employeeId!: string;

  @Column({ type: 'uuid', name: 'certification_type_id' })
  certificationTypeId!: string;

  /** ISO date string YYYY-MM-DD. Inclusive lower bound. */
  @Column({ type: 'date', name: 'valid_from' })
  validFrom!: string;

  /** ISO date string YYYY-MM-DD. Inclusive upper bound. */
  @Column({ type: 'date', name: 'valid_to' })
  validTo!: string;

  @Column({ type: 'varchar', length: 100, name: 'certificate_number', nullable: true })
  certificateNumber!: string | null;

  /** SHA-256 hex of the scanned document — S3 content-addressed reference. */
  @Column({ type: 'varchar', length: 64, name: 'document_sha256', nullable: true })
  documentSha256!: string | null;

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at_utc' })
  createdAtUtc!: Date;
}
