import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface AllocateFuelCostInput {
  tenantId: string;
  siteId: string;
  operationalDayId: string;
  /** Tonnage produced this op-day (kg). Used for per-ton allocation. */
  tonnageKg: bigint;
}

export interface AllocateFuelCostResult {
  amountMinorUnits: bigint;
  costPerTonMinorUnits: bigint;
  currency: string;
}

interface ConsumptionAggregateRow {
  total_cost_minor_units: string | null;
  currency: string | null;
}

/**
 * FuelCostAllocatorService — wires the W2-P05 stockpile valuation stub
 * (StockpileValuationService.computeInflowCost returned XOF zero) to a
 * real per-op-day fuel cost figure.
 *
 * Algorithm (cost_model_version=1):
 *   1. Sum (liters × cost_per_liter_minor_units) for every
 *      equipment_fuel_consumption row in the same operational_day_id.
 *   2. Currency is taken from the dominant currency of the consumptions
 *      for that op-day; mixed currencies fall back to XOF (UEMOA default).
 *   3. Pro-rata per ton = total_cost / (tonnage_kg / 1000), truncated to
 *      bigint minor units.
 *
 * Returns zeroed XOF if no consumption rows exist (e.g. tipper trip with
 * no recorded refuels yet — projection math stays well-defined).
 */
@Injectable()
export class FuelCostAllocatorService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async allocateFuelCostForOperationalDay(
    input: AllocateFuelCostInput,
  ): Promise<AllocateFuelCostResult> {
    const rows = (await this.ds.query(
      `SELECT
         COALESCE(SUM(liters * cost_per_liter_minor_units), 0)::text AS total_cost_minor_units,
         (SELECT currency
            FROM equipment_fuel_consumption
           WHERE tenant_id = $1 AND operational_day_id = $2
             AND currency IS NOT NULL
           GROUP BY currency
           ORDER BY COUNT(*) DESC
           LIMIT 1) AS currency
         FROM equipment_fuel_consumption
        WHERE tenant_id = $1 AND operational_day_id = $2
          AND cost_per_liter_minor_units IS NOT NULL`,
      [input.tenantId, input.operationalDayId],
    )) as ConsumptionAggregateRow[];

    const totalRaw = rows[0]?.total_cost_minor_units ?? '0';
    const currency = rows[0]?.currency ?? 'XOF';
    // Total cost arrives as numeric — split decimal point if any (PG returns
    // the multiplication result as text including potential decimals).
    const totalMinorUnits = BigInt(stripDecimal(totalRaw));

    if (input.tonnageKg <= 0n) {
      return {
        amountMinorUnits: totalMinorUnits,
        costPerTonMinorUnits: 0n,
        currency,
      };
    }

    // tonnes = kg / 1000 — keep all algebra in bigint, scale numerator by 1000.
    const costPerTon = (totalMinorUnits * 1000n) / input.tonnageKg;
    return {
      amountMinorUnits: totalMinorUnits,
      costPerTonMinorUnits: costPerTon,
      currency,
    };
  }
}

function stripDecimal(numeric: string): string {
  const idx = numeric.indexOf('.');
  return idx === -1 ? numeric : numeric.slice(0, idx);
}
