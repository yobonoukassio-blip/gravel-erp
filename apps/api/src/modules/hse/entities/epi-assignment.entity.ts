import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EpiItem } from './epi-item.entity';

export type EpiCondition = 'good' | 'damaged' | 'condemned';

/**
 * HSE-03 per-employee EPI issuance row.
 *
 * Append-style: a "condemn" or "return" sets returned_at_utc + returned_by;
 * to re-issue, INSERT a new row. The (tenant, employee) WHERE returned_at_utc
 * IS NULL index supports "currently held items" lookups.
 */
@Entity({ name: 'epi_assignment' })
@Index('epi_assignment_item_idx', ['epiItemId'])
export class EpiAssignment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId!: string;

  @Column({ name: 'epi_item_id', type: 'uuid' })
  epiItemId!: string;

  @ManyToOne(() => EpiItem, { eager: false })
  @JoinColumn({ name: 'epi_item_id' })
  epiItem?: EpiItem;

  @Column({ name: 'issued_at_utc', type: 'timestamptz' })
  issuedAtUtc!: Date;

  @Column({ name: 'issued_by', type: 'uuid' })
  issuedBy!: string;

  @Column({ name: 'returned_at_utc', type: 'timestamptz', nullable: true })
  returnedAtUtc!: Date | null;

  @Column({ name: 'returned_by', type: 'uuid', nullable: true })
  returnedBy!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'good' })
  condition!: EpiCondition;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at_utc', type: 'timestamptz' })
  createdAtUtc!: Date;
}
