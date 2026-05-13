import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Audit row: spare part consumed by a work order. */
@Entity({ name: 'spare_part_consumption' })
@Index('spc_wo_idx', ['workOrderId'])
export class SparePartConsumption {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'work_order_id' })
  workOrderId!: string;

  @Column({ type: 'uuid', name: 'spare_part_id' })
  sparePartId!: string;

  @Column({ type: 'int' })
  quantity!: number;

  @CreateDateColumn({ name: 'consumed_at_utc', type: 'timestamptz' })
  consumedAtUtc!: Date;
}
