import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * CostPerTonSnapshot (FIN-01).
 * Daily materialized snapshot of cost-per-ton per site × material × calibre.
 * All monetary values in bigint minor units (XOF or pivot currency).
 * Components: extraction, transport, concassage, criblage, carburant, main_d_oeuvre, amortissement.
 */
@Entity({ name: 'cost_per_ton_snapshot' })
@Index('cpt_snapshot_tenant_site_date_uq', ['tenantId', 'siteId', 'snapshotDate', 'calibreCode'], {
  unique: true,
})
export class CostPerTonSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId!: string;

  @Column({ type: 'date', name: 'snapshot_date' })
  snapshotDate!: string;

  @Column({ type: 'varchar', length: 50, name: 'material_type' })
  materialType!: string;

  @Column({ type: 'varchar', length: 50, name: 'calibre_code' })
  calibreCode!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'tonnage_produced_t' })
  tonnageProducedT!: string;

  // Cost components — all bigint minor units in pivot currency
  @Column({ type: 'bigint', name: 'cost_extraction_minor', default: 0 })
  costExtractionMinor!: string;

  @Column({ type: 'bigint', name: 'cost_transport_minor', default: 0 })
  costTransportMinor!: string;

  @Column({ type: 'bigint', name: 'cost_concassage_minor', default: 0 })
  costConcassageMinor!: string;

  @Column({ type: 'bigint', name: 'cost_criblage_minor', default: 0 })
  costCriblageMinor!: string;

  @Column({ type: 'bigint', name: 'cost_carburant_minor', default: 0 })
  costCarburantMinor!: string;

  @Column({ type: 'bigint', name: 'cost_main_oeuvre_minor', default: 0 })
  costMainOeuvreMinor!: string;

  @Column({ type: 'bigint', name: 'cost_amortissement_minor', default: 0 })
  costAmortissementMinor!: string;

  @Column({ type: 'bigint', name: 'total_cost_minor' })
  totalCostMinor!: string;

  @Column({ type: 'bigint', name: 'cost_per_ton_minor' })
  costPerTonMinor!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'boolean', name: 'is_provisional', default: true })
  isProvisional!: boolean;
}
