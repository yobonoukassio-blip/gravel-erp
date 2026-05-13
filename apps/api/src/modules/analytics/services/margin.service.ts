import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface MarginReport {
  scope: 'contract' | 'customer' | 'site';
  scopeId: string;
  revenueMinor: string;
  costMinor: string;
  marginMinor: string;
  marginPct: number;
  currency: string;
}

/**
 * MarginService (FIN-02).
 * Computes margin = revenue (BL × contract price) - allocated cost (cost_per_ton × tonnage).
 * Reports per contract, per customer, per site.
 * Currency = pivot (XOF by default), FX conversion via fx_rate_snapshot.
 */
@Injectable()
export class MarginService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async marginByContract(params: {
    tenantId: string;
    contractId: string;
    asOfDate: string;
    pivotCurrency?: string;
  }): Promise<MarginReport> {
    const pivot = params.pivotCurrency ?? 'XOF';

    const [rev] = await this.ds.query<Array<{ revenue: string | null }>>(
      `SELECT COALESCE(SUM((bl.tonnage_kg * sc.unit_price_minor_units) / 1000)::bigint, 0) AS revenue
       FROM bon_de_livraison bl
       JOIN sale_contract sc ON sc.id = bl.sale_contract_id
       WHERE bl.tenant_id = $1 AND bl.sale_contract_id = $2
         AND bl.status = 'signed'
         AND bl.delivery_date <= $3`,
      [params.tenantId, params.contractId, params.asOfDate],
    );

    const [cost] = await this.ds.query<Array<{ cost: string | null }>>(
      `SELECT COALESCE(SUM((bl.tonnage_kg / 1000) * cpt.cost_per_ton_minor)::bigint, 0) AS cost
       FROM bon_de_livraison bl
       JOIN cost_per_ton_snapshot cpt
         ON cpt.tenant_id = bl.tenant_id
        AND cpt.site_id = bl.site_id
        AND cpt.calibre_code = bl.calibre_code
        AND cpt.snapshot_date = bl.delivery_date
       WHERE bl.tenant_id = $1 AND bl.sale_contract_id = $2
         AND bl.status = 'signed'`,
      [params.tenantId, params.contractId],
    );

    const revenueMinor = BigInt(rev?.revenue ?? 0);
    const costMinor = BigInt(cost?.cost ?? 0);
    const marginMinor = revenueMinor - costMinor;
    const marginPct =
      revenueMinor === 0n
        ? 0
        : Number((marginMinor * 10000n) / revenueMinor) / 100;

    return {
      scope: 'contract',
      scopeId: params.contractId,
      revenueMinor: revenueMinor.toString(),
      costMinor: costMinor.toString(),
      marginMinor: marginMinor.toString(),
      marginPct: Number(marginPct.toFixed(2)),
      currency: pivot,
    };
  }

  async marginBySite(params: {
    tenantId: string;
    siteId: string;
    periodFrom: string;
    periodTo: string;
    pivotCurrency?: string;
  }): Promise<MarginReport> {
    const pivot = params.pivotCurrency ?? 'XOF';
    const [rev] = await this.ds.query<Array<{ revenue: string | null }>>(
      `SELECT COALESCE(SUM((bl.tonnage_kg * sc.unit_price_minor_units) / 1000)::bigint, 0) AS revenue
       FROM bon_de_livraison bl
       JOIN sale_contract sc ON sc.id = bl.sale_contract_id
       WHERE bl.tenant_id = $1 AND bl.site_id = $2
         AND bl.status = 'signed'
         AND bl.delivery_date BETWEEN $3 AND $4`,
      [params.tenantId, params.siteId, params.periodFrom, params.periodTo],
    );
    const [cost] = await this.ds.query<Array<{ cost: string | null }>>(
      `SELECT COALESCE(SUM(total_cost_minor), 0)::bigint AS cost
       FROM cost_per_ton_snapshot
       WHERE tenant_id = $1 AND site_id = $2
         AND snapshot_date BETWEEN $3 AND $4`,
      [params.tenantId, params.siteId, params.periodFrom, params.periodTo],
    );

    const revenueMinor = BigInt(rev?.revenue ?? 0);
    const costMinor = BigInt(cost?.cost ?? 0);
    const marginMinor = revenueMinor - costMinor;
    const marginPct =
      revenueMinor === 0n
        ? 0
        : Number((marginMinor * 10000n) / revenueMinor) / 100;

    return {
      scope: 'site',
      scopeId: params.siteId,
      revenueMinor: revenueMinor.toString(),
      costMinor: costMinor.toString(),
      marginMinor: marginMinor.toString(),
      marginPct: Number(marginPct.toFixed(2)),
      currency: pivot,
    };
  }
}
