import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'operational_days' })
@Index('operational_days_site_date_uq', ['siteId', 'businessDate'], { unique: true })
export class OperationalDay {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId!: string;

  @Column({ type: 'date', name: 'business_date' })
  businessDate!: string;

  @Column({ type: 'time', name: 'shift_start_local' })
  shiftStartLocal!: string;

  @Column({ type: 'text', name: 'iana_timezone' })
  ianaTimezone!: string;

  @Column({ type: 'timestamptz', name: 'started_at_utc' })
  startedAtUtc!: Date;

  @Column({ type: 'timestamptz', name: 'ended_at_utc' })
  endedAtUtc!: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
