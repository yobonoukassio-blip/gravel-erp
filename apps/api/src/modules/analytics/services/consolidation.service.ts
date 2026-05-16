import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface ConsolidatedPnL {
  pivotCurrency: string;
  periodFrom: string;
  periodTo: string;
  bySite: Array<{
    siteId: string;
    fxSnapshotId?: string;
    revenueMinor: string;
    costMinor: string;
    marginMinor: string;
    tonnageT: number;
    byContract: Array<{
      contractId: string;
      revenueMinor: string;
      costMinor: string;
      marginMinor: string;
      tonnageT: number;
    }>;
    byCalibre: Array<{
      calibreCode: string;
      revenueMinor: string;
      costMinor: string;
      marginMinor: string;
      tonnageT: number;
    }>;
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
    const revRows = await this.ds.query<Array<Record<string, unknown>>>(
      `SELECT bl.site_id,
              bl.sale_contract_id AS contract_id,
              bl.calibre_code,
              COALESCE(SUM((bl.tonnage_kg * sc.unit_price_minor_units) / 1000)::bigint, 0) AS revenue,
              COALESCE(SUM((bl.tonnage_kg / 1000) * cpt.cost_per_ton_minor)::bigint, 0) AS sold_cost,
              COALESCE(SUM(bl.tonnage_kg) / 1000, 0)::numeric AS tonnage,
              sc.currency
       FROM bon_de_livraison bl
       JOIN sale_contract sc ON sc.id = bl.sale_contract_id
       LEFT JOIN cost_per_ton_snapshot cpt ON cpt.tenant_id = bl.tenant_id AND cpt.site_id = bl.site_id AND cpt.calibre_code = bl.calibre_code AND cpt.snapshot_date = bl.delivery_date
       WHERE bl.tenant_id = $1
         AND bl.status = 'signed'
         AND bl.delivery_date BETWEEN $2 AND $3
       GROUP BY bl.site_id, bl.sale_contract_id, bl.calibre_code, sc.currency`,
      [params.tenantId, params.periodFrom, params.periodTo],
    );

    const costRows = await this.ds.query<Array<Record<string, unknown>>>(
      `SELECT site_id, calibre_code, currency, COALESCE(SUM(total_cost_minor), 0)::bigint AS cost
       FROM cost_per_ton_snapshot
       WHERE tenant_id = $1 AND snapshot_date BETWEEN $2 AND $3
       GROUP BY site_id, calibre_code, currency`,
      [params.tenantId, params.periodFrom, params.periodTo],
    );

    const fxMap = new Map<string, { rate: bigint; id: string }>();
    const getFx = async (fromCurr: string) => {
      if (!fromCurr || fromCurr === params.pivotCurrency) return null;
      if (fxMap.has(fromCurr)) return fxMap.get(fromCurr);
      const fx = await this.ds.query<Array<{ id: string; rate: string }>>(
        `SELECT id, rate::text FROM fx_rate_snapshot
         WHERE tenant_id = $1 AND currency_from = $2 AND currency_to = $3
           AND snapshot_date <= $4
         ORDER BY snapshot_date DESC LIMIT 1`,
        [params.tenantId, fromCurr, params.pivotCurrency, params.periodTo],
      );
      if (fx.length > 0) {
        const scaled = BigInt(Math.round(Number(fx[0].rate) * 1e8));
        const res = { rate: scaled, id: fx[0].id };
        fxMap.set(fromCurr, res);
        return res;
      }
      return null;
    };

    const siteAgg = new Map<string, Record<string, unknown>>();
    const getSite = (siteId: string) => {
      if (!siteAgg.has(siteId)) {
        siteAgg.set(siteId, {
          siteId,
          fxSnapshotId: undefined,
          revenueMinor: 0n,
          costMinor: 0n,
          tonnageT: 0,
          byContract: new Map<string, Record<string, unknown>>(),
          byCalibre: new Map<string, Record<string, unknown>>(),
        });
      }
      return siteAgg.get(siteId);
    };

    for (const r of revRows) {
      const s = getSite(r.site_id);
      let rev = BigInt(r.revenue ?? 0);
      let soldCost = BigInt(r.sold_cost ?? 0);
      const fx = await getFx(r.currency);
      if (fx) {
        rev = (rev * fx.rate) / 100_000_000n;
        soldCost = (soldCost * fx.rate) / 100_000_000n;
        s.fxSnapshotId = fx.id;
      }
      const ton = Number(r.tonnage ?? 0);
      s.revenueMinor += rev;
      s.tonnageT += ton;

      if (!s.byContract.has(r.contract_id)) {
        s.byContract.set(r.contract_id, { contractId: r.contract_id, revenueMinor: 0n, costMinor: 0n, tonnageT: 0 });
      }
      const c = s.byContract.get(r.contract_id);
      c.revenueMinor += rev;
      c.costMinor += soldCost;
      c.tonnageT += ton;

      if (!s.byCalibre.has(r.calibre_code)) {
        s.byCalibre.set(r.calibre_code, { calibreCode: r.calibre_code, revenueMinor: 0n, costMinor: 0n, tonnageT: 0 });
      }
      const cal = s.byCalibre.get(r.calibre_code);
      cal.revenueMinor += rev;
      cal.tonnageT += ton;
    }

    for (const c of costRows) {
      const s = getSite(c.site_id);
      let cost = BigInt(c.cost ?? 0);
      const fx = await getFx(c.currency);
      if (fx) {
        cost = (cost * fx.rate) / 100_000_000n;
        s.fxSnapshotId = fx.id;
      }
      s.costMinor += cost;

      if (!s.byCalibre.has(c.calibre_code)) {
        s.byCalibre.set(c.calibre_code, { calibreCode: c.calibre_code, revenueMinor: 0n, costMinor: 0n, tonnageT: 0 });
      }
      const cal = s.byCalibre.get(c.calibre_code);
      cal.costMinor += cost;
    }

    const bySite: ConsolidatedPnL['bySite'] = [];
    let totalRevenue = 0n;
    let totalCost = 0n;

    for (const s of siteAgg.values()) {
      const marginMinor = s.revenueMinor - s.costMinor;
      
      const byContract = Array.from(s.byContract.values()).map((c: Record<string, unknown>) => ({
        ...c,
        revenueMinor: c.revenueMinor.toString(),
        costMinor: c.costMinor.toString(),
        marginMinor: (c.revenueMinor - c.costMinor).toString(),
      }));

      const byCalibre = Array.from(s.byCalibre.values()).map((cal: Record<string, unknown>) => ({
        ...cal,
        revenueMinor: cal.revenueMinor.toString(),
        costMinor: cal.costMinor.toString(),
        marginMinor: (cal.revenueMinor - cal.costMinor).toString(),
      }));

      bySite.push({
        siteId: s.siteId,
        fxSnapshotId: s.fxSnapshotId,
        revenueMinor: s.revenueMinor.toString(),
        costMinor: s.costMinor.toString(),
        marginMinor: marginMinor.toString(),
        tonnageT: s.tonnageT,
        byContract,
        byCalibre,
      });

      totalRevenue += s.revenueMinor;
      totalCost += s.costMinor;
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
