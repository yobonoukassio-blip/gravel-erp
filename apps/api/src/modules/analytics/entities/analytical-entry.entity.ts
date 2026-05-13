import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * AnalyticalEntry (FIN-04) — analytical accounting ledger.
 * Per cost center × activity × site × date.
 * Source: BL, work_order, refuel, extraction_cycle, etc. (via source_table + source_id).
 * Exportable via FIN-05 adapter.
 */
@Entity({ name: 'analytical_entry' })
@Index('ae_tenant_site_date_idx', ['tenantId', 'siteId', 'entryDate'])
@Index('ae_source_uq', ['tenantId', 'sourceTable', 'sourceId', 'costCenter'], { unique: true })
export class AnalyticalEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId!: string;

  @Column({ type: 'date', name: 'entry_date' })
  entryDate!: string;

  @Column({ type: 'varchar', length: 30, name: 'cost_center' })
  costCenter!: string;

  @Column({ type: 'varchar', length: 50 })
  activity!: string;

  @Column({ type: 'varchar', length: 200 })
  label!: string;

  @Column({ type: 'bigint', name: 'amount_minor_units' })
  amountMinorUnits!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'varchar', length: 1, name: 'debit_credit' })
  debitCredit!: 'D' | 'C';

  @Column({ type: 'varchar', length: 50, name: 'source_table' })
  sourceTable!: string;

  @Column({ type: 'uuid', name: 'source_id' })
  sourceId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
