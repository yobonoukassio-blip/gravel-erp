import { Column, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * StockpileBalance — materialized projection from stockpile_event.
 *
 * Keyed by (tenant_id, stockpile_id, calibre_code). Maintained by the
 * balance-projection event handler; recomputed nightly to detect drift.
 */
@Entity({ name: 'stockpile_balance' })
@Index('stockpile_balance_site_idx', ['tenantId', 'siteId'])
export class StockpileBalance {
  @PrimaryColumn({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @PrimaryColumn({ type: 'uuid', name: 'stockpile_id' })
  stockpileId!: string;

  @PrimaryColumn({ type: 'varchar', length: 50, name: 'calibre_code' })
  calibreCode!: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId!: string;

  @Column({ type: 'bigint', name: 'balance_kg', default: 0 })
  balanceKg!: string;

  @Column({ type: 'uuid', name: 'last_event_id', nullable: true })
  lastEventId?: string | null;

  @UpdateDateColumn({ type: 'timestamptz', name: 'last_refresh_utc' })
  lastRefreshUtc!: Date;

  @Column({
    type: 'bigint',
    name: 'weighted_avg_cost_per_ton_minor_units',
    default: 0,
  })
  weightedAvgCostPerTonMinorUnits!: string;

  @Column({ type: 'char', length: 3, name: 'currency', nullable: true })
  currency?: string | null;
}
