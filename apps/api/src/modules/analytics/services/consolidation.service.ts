import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * SF-008 (audit 2026-05-16): thrown when consolidation needs an FX rate that
 * doesn't exist in `fx_rate_snapshot`. Surface as a 400 with a clear message
 * so the group dashboard can render "FX rate missing — please import rates
 * for <from>→<to> as of <date>" instead of returning a corrupted P&L.
 */
export class MissingFxRateError extends BadRequestException {
  constructor(currencyFrom: string, currencyTo: string, asOf: string) {
    super({
      code: 'FX_RATE_MISSING',
      currencyFrom,
      currencyTo,
      asOf,
      message: `FX rate missing for ${currencyFrom}→${currencyTo} as of ${asOf}. Import a fx_rate_snapshot row before retrying consolidation.`,
    });
  }
}

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
      // SF-008 (audit 2026-05-16): no FX rate available — previously returned
      // null and the caller summed centimes EUR with units XOF, producing a
      // consolidated P&L off by a factor of 100-650. Now throws so the group
      // dashboard surfaces "FX rate missing for X→Y on Z" instead of garbage.
      throw new MissingFxRateError(fromCurr, params.pivotCurrency, params.periodTo);
    };

    interface ContractAgg {
      contractId: string;
      revenueMinor: bigint;
      costMinor: bigint;
      tonnageT: number;
    }
    interface CalibreAgg {
      calibreCode: string;
      revenueMinor: bigint;
      costMinor: bigint;
      tonnageT: number;
    }
    interface SiteAgg {
      siteId: string;
      fxSnapshotId: string | undefined;
      revenueMinor: bigint;
      costMinor: bigint;
      tonnageT: number;
      byContract: Map<string, ContractAgg>;
      byCalibre: Map<string, CalibreAgg>;
    }

    const siteAgg = new Map<string, SiteAgg>();
    const getSite = (siteId: string): SiteAgg => {
      let s = siteAgg.get(siteId);
      if (!s) {
        s = {
          siteId,
          fxSnapshotId: undefined,
          revenueMinor: 0n,
          costMinor: 0n,
          tonnageT: 0,
          byContract: new Map<string, ContractAgg>(),
          byCalibre: new Map<string, CalibreAgg>(),
        };
        siteAgg.set(siteId, s);
      }
      return s;
    };

    for (const r of revRows) {
      const s = getSite(String(r['site_id']));
      let rev = BigInt(String(r['revenue'] ?? 0));
      let soldCost = BigInt(String(r['sold_cost'] ?? 0));
      const fx = await getFx(String(r['currency'] ?? ''));
      if (fx) {
        rev = (rev * fx.rate) / 100_000_000n;
        soldCost = (soldCost * fx.rate) / 100_000_000n;
        s.fxSnapshotId = fx.id;
      }
      const ton = Number(r['tonnage'] ?? 0);
      s.revenueMinor += rev;
      s.tonnageT += ton;

      const contractId = String(r['contract_id']);
      let c = s.byContract.get(contractId);
      if (!c) {
        c = { contractId, revenueMinor: 0n, costMinor: 0n, tonnageT: 0 };
        s.byContract.set(contractId, c);
      }
      c.revenueMinor += rev;
      c.costMinor += soldCost;
      c.tonnageT += ton;

      const calibreCode = String(r['calibre_code']);
      let cal = s.byCalibre.get(calibreCode);
      if (!cal) {
        cal = { calibreCode, revenueMinor: 0n, costMinor: 0n, tonnageT: 0 };
        s.byCalibre.set(calibreCode, cal);
      }
      cal.revenueMinor += rev;
      cal.tonnageT += ton;
    }

    for (const c of costRows) {
      const s = getSite(String(c['site_id']));
      let cost = BigInt(String(c['cost'] ?? 0));
      const fx = await getFx(String(c['currency'] ?? ''));
      if (fx) {
        cost = (cost * fx.rate) / 100_000_000n;
        s.fxSnapshotId = fx.id;
      }
      s.costMinor += cost;

      const calibreCode = String(c['calibre_code']);
      let cal = s.byCalibre.get(calibreCode);
      if (!cal) {
        cal = { calibreCode, revenueMinor: 0n, costMinor: 0n, tonnageT: 0 };
        s.byCalibre.set(calibreCode, cal);
      }
      cal.costMinor += cost;
    }

    const bySite: ConsolidatedPnL['bySite'] = [];
    let totalRevenue = 0n;
    let totalCost = 0n;

    for (const s of siteAgg.values()) {
      const marginMinor = s.revenueMinor - s.costMinor;

      const byContract = Array.from(s.byContract.values()).map((c) => ({
        contractId: c.contractId,
        revenueMinor: c.revenueMinor.toString(),
        costMinor: c.costMinor.toString(),
        marginMinor: (c.revenueMinor - c.costMinor).toString(),
        tonnageT: c.tonnageT,
      }));

      const byCalibre = Array.from(s.byCalibre.values()).map((cal) => ({
        calibreCode: cal.calibreCode,
        revenueMinor: cal.revenueMinor.toString(),
        costMinor: cal.costMinor.toString(),
        marginMinor: (cal.revenueMinor - cal.costMinor).toString(),
        tonnageT: cal.tonnageT,
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
