import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface ConsolidatedPnL {
  pivotCurrency: string;
  periodFrom: string;
  periodTo: string;
  bySite: Array<{
    siteId: string;
    revenueMinor: string;
    costMinor: string;
    marginMinor: string;
    tonnageT: number;
  }>;
  totalRevenueMinor: string;
  totalCostMinor: string;
  totalMarginMinor: string;
  marginPct: number;
}

/**
 * ConsolidationService (FIN-06).
 *
 * Aggregates revenue + cost across all sites of a tenant into a pivot currency
 * (XOF or EUR), using fx_rate_snapshot to convert non-pivot site currencies.
 * Provides drill-down list per site so dashboards can compare site → site.
 */
@Injectable()
export class ConsolidationService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async consolidate(params: {
    tenantId: string;
    pivotCurrency: 'XOF' | 'EUR';
    periodFrom: string;
    periodTo: string;
  }): Promise<ConsolidatedPnL> {
    const rows = await this.ds.query<
      Array<{
        site_id: string;
        revenue: string | null;
        cost: string | null;
        tonnage: string | null;
        currency: string;
      }>
    >(
      `SELECT bl.site_id,
              COALESCE(SUM((bl.tonnage_kg * sc.unit_price_minor_units) / 1000)::bigint, 0) AS revenue,
              0::bigint AS cost,
              COALESCE(SUM(bl.tonnage_kg) / 1000, 0)::numeric AS tonnage,
              sc.currency
       FROM bon_de_livraison bl
       JOIN sale_contract sc ON sc.id = bl.sale_contract_id
       WHERE bl.tenant_id = $1
         AND bl.status = 'signed'
         AND bl.delivery_date BETWEEN $2 AND $3
       GROUP BY bl.site_id, sc.currency`,
      [params.tenantId, params.periodFrom, params.periodTo],
    );

    // Site-level costs from cost_per_ton_snapshot
    const costRows = await this.ds.query<Array<{ site_id: string; cost: string | null }>>(
      `SELECT site_id, COALESCE(SUM(total_cost_minor), 0)::bigint AS cost
       FROM cost_per_ton_snapshot
       WHERE tenant_id = $1 AND snapshot_date BETWEEN $2 AND $3
       GROUP BY site_id`,
      [params.tenantId, params.periodFrom, params.periodTo],
    );
    const costMap = new Map(costRows.map((r) => [r.site_id, BigInt(r.cost ?? 0)]));

    const bySite: ConsolidatedPnL['bySite'] = [];
    let totalRevenue = 0n;
    let totalCost = 0n;

    for (const r of rows) {
      let revenueMinor = BigInt(r.revenue ?? 0);
      // FX convert revenue if site currency differs from pivot
      if (r.currency !== params.pivotCurrency) {
        const fx = await this.ds.query<Array<{ rate: string }>>(
          `SELECT rate::text FROM fx_rate_snapshot
           WHERE tenant_id = $1 AND currency_from = $2 AND currency_to = $3
             AND snapshot_date <= $4
           ORDER BY snapshot_date DESC LIMIT 1`,
          [params.tenantId, r.currency, params.pivotCurrency, params.periodTo],
        );
        if (fx.length > 0) {
          const scaled = BigInt(Math.round(Number(fx[0].rate) * 1e8));
          revenueMinor = (revenueMinor * scaled) / 100_000_000n;
        }
      }
      const costMinor = costMap.get(r.site_id) ?? 0n;
      const marginMinor = revenueMinor - costMinor;

      bySite.push({
        siteId: r.site_id,
        revenueMinor: revenueMinor.toString(),
        costMinor: costMinor.toString(),
        marginMinor: marginMinor.toString(),
        tonnageT: Number(r.tonnage ?? 0),
      });

      totalRevenue += revenueMinor;
      totalCost += costMinor;
    }

    const totalMargin = totalRevenue - totalCost;
    const marginPct =
      totalRevenue === 0n ? 0 : Number((totalMargin * 10000n) / totalRevenue) / 100;

    return {
      pivotCurrency: params.pivotCurrency,
      periodFrom: params.periodFrom,
      periodTo: params.periodTo,
      bySite,
      totalRevenueMinor: totalRevenue.toString(),
      totalCostMinor: totalCost.toString(),
      totalMarginMinor: totalMargin.toString(),
      marginPct: Number(marginPct.toFixed(2)),
    };
  }
}
