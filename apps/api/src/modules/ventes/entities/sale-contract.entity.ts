import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** SaleContract (VTE-02) — pricing + period + authorized transporters per customer. */
@Entity({ name: 'sale_contract' })
@Index('sale_contract_tenant_customer_idx', ['tenantId', 'customerId'])
export class SaleContract {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'customer_id' })
  customerId!: string;

  @Column({ type: 'varchar', length: 50 })
  reference!: string;

  @Column({ type: 'varchar', length: 50, name: 'calibre_code' })
  calibreCode!: string;

  // dinero.js bigint minor units — never float
  @Column({ type: 'bigint', name: 'unit_price_minor_units' })
  unitPriceMinorUnits!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'planned_tonnage_t' })
  plannedTonnageT!: string;

  @Column({ type: 'date', name: 'period_from' })
  periodFrom!: string;

  @Column({ type: 'date', name: 'period_to' })
  periodTo!: string;

  @Column({ type: 'uuid', array: true, name: 'authorized_transporter_ids', default: () => `'{}'::uuid[]` })
  authorizedTransporterIds!: string[];

  @Column({ type: 'boolean', name: 'is_export', default: false })
  isExport!: boolean;
}
