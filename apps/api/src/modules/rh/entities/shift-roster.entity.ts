import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** One roster slot: an employee assigned to a position for a given shift type. */
export interface RosterSlot {
  employee_id: string;
  position_code: string;
  shift_type: 'JOUR' | 'NUIT';
}

/**
 * ShiftRoster entity (RH-03) — mutable with pessimistic_lock strategy.
 *
 * One roster per (site, roster_date). Updated via PUT with `version` header.
 * Server rejects with 409 CONFLICT if the provided version doesn't match.
 */
@Entity({ name: 'shift_roster' })
@Index('shift_roster_site_date_uq', ['tenantId', 'siteId', 'rosterDate'], { unique: true })
export class ShiftRoster {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId!: string;

  @Column({ type: 'date', name: 'roster_date' })
  rosterDate!: string;

  /** Array of { employee_id, position_code, shift_type } objects. */
  @Column({ type: 'jsonb', name: 'roster_jsonb', default: '[]' })
  rosterJsonb!: RosterSlot[];

  /** Optimistic lock version — incremented on every PUT. */
  @Column({ type: 'int', name: 'version', default: 1 })
  version!: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at_utc' })
  createdAtUtc!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at_utc' })
  updatedAtUtc!: Date;
}
