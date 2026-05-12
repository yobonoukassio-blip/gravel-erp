import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type ShiftKind = 'day' | 'night' | 'overlap';

@Entity({ name: 'shifts' })
export class Shift {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Index()
  @Column({ type: 'uuid', name: 'operational_day_id' })
  operationalDayId!: string;

  @Column({ type: 'text' })
  kind!: ShiftKind;

  @Column({ type: 'timestamptz', name: 'started_at_utc' })
  startedAtUtc!: Date;

  @Column({ type: 'timestamptz', name: 'ended_at_utc' })
  endedAtUtc!: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
