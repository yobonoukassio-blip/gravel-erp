import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** SparePart (MNT-04) — inventory of consumable maintenance items. */
@Entity({ name: 'spare_part' })
@Index('spare_part_tenant_site_sku_uq', ['tenantId', 'siteId', 'sku'], { unique: true })
export class SparePart {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId!: string;

  @Column({ type: 'varchar', length: 100 })
  sku!: string;

  @Column({ type: 'varchar', length: 200 })
  label!: string;

  @Column({ type: 'int', name: 'quantity_on_hand', default: 0 })
  quantityOnHand!: number;

  @Column({ type: 'int', name: 'threshold_min', nullable: true })
  thresholdMin!: number | null;

  @Column({ type: 'boolean', name: 'below_threshold', default: false })
  belowThreshold!: boolean;
}
