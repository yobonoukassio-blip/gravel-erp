import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Budget, BudgetCategory } from '../entities/budget.entity';

export interface BudgetVsActual {
  category: BudgetCategory;
  budgetMinor: string;
  actualMinor: string;
  variancePct: number; // (actual - budget) / budget × 100
  status: 'on_track' | 'warning' | 'over';
}

/**
 * BudgetComparisonService (FIN-03).
 * For each budget category, compare YTD actual vs annual budget pro-rated to today.
 * status thresholds: < 5% deviation = on_track; 5-15% = warning; > 15% = over.
 */
@Injectable()
export class BudgetComparisonService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async compareForSite(params: {
    tenantId: string;
    siteId: string;
    year: number;
    asOfDate: string;
  }): Promise<BudgetVsActual[]> {
    const budgets = await this.ds.getRepository(Budget).find({
      where: { tenantId: params.tenantId, siteId: params.siteId, year: params.year },
    });

    const dayOfYear = this.dayOfYear(params.asOfDate);
    const ytdRatio = dayOfYear / 365;

    const results: BudgetVsActual[] = [];
    for (const b of budgets) {
      const actualRow = await this.ds.query<Array<{ total: string | null }>>(
        `SELECT COALESCE(SUM(amount_minor_units), 0)::bigint AS total
         FROM analytical_entry
         WHERE tenant_id = $1 AND site_id = $2
           AND entry_date >= ($3 || '-01-01')::date
           AND entry_date <= $4::date
           AND cost_center = $5`,
        [params.tenantId, params.siteId, params.year, params.asOfDate, b.category],
      );
      const actualMinor = BigInt(actualRow[0]?.total ?? 0);
      const budgetMinor = BigInt(b.budgetMinorUnits);
      const proratedBudget = (budgetMinor * BigInt(Math.round(ytdRatio * 10000))) / 10000n;

      const varianceBps =
        proratedBudget === 0n
          ? 0
          : Number(((actualMinor - proratedBudget) * 10000n) / proratedBudget);
      const variancePct = varianceBps / 100;

      let status: 'on_track' | 'warning' | 'over' = 'on_track';
      if (Math.abs(variancePct) > 15) status = 'over';
      else if (Math.abs(variancePct) > 5) status = 'warning';

      results.push({
        category: b.category,
        budgetMinor: budgetMinor.toString(),
        actualMinor: actualMinor.toString(),
        variancePct: Number(variancePct.toFixed(2)),
        status,
      });
    }
    return results;
  }

  private dayOfYear(dateStr: string): number {
    const d = new Date(dateStr);
    const start = new Date(d.getFullYear(), 0, 0);
    return Math.floor((d.getTime() - start.getTime()) / 86_400_000);
  }
}
