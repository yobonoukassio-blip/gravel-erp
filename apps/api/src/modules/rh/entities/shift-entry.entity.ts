import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * ShiftEntry entity (RH-02) — append-only.
 *
 * Sync strategy: `append_only_event` (same as DrilledHole, HseIncident).
 * BEFORE UPDATE/DELETE trigger at DB level blocks any mutation.
 *
 * "Corrections" (wrong check-in time, wrong employee) must be submitted as a
 * new row with `supersedes_id` pointing to the original.
 */
@Entity({ name: 'shift_entry' })
@Index('shift_entry_tenant_opday_emp_idx', ['tenantId', 'operationalDayId', 'employeeId'])
export class ShiftEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId!: string;

  @Column({ type: 'uuid', name: 'operational_day_id' })
  operationalDayId!: string;

  @Column({ type: 'uuid', name: 'employee_id' })
  employeeId!: string;

  @Column({ type: 'timestamptz', name: 'check_in_utc' })
  checkInUtc!: Date;

  @Column({ type: 'timestamptz', name: 'check_out_utc', nullable: true })
  checkOutUtc!: Date | null;

  @Column({ type: 'varchar', length: 50, name: 'position_code', nullable: true })
  positionCode!: string | null;

  /** Supervisor who validated this entry. */
  @Column({ type: 'uuid', name: 'supervisor_id' })
  supervisorId!: string;

  /** Points to a previous ShiftEntry this row supersedes (corrections). */
  @Column({ type: 'uuid', name: 'supersedes_id', nullable: true })
  supersedesId!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at_utc' })
  createdAtUtc!: Date;
}
