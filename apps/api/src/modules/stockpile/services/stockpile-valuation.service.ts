import { Injectable } from '@nestjs/common';

export interface InflowCostInput {
  tenantId: string;
  rotationId: string;
  operationalDayId: string;
  /** Loaded tonnage in kg (signed bigint, positive for inflow). */
  loadedTonnageKg: bigint;
}

export interface InflowCost {
  /** Cost per ton in minor units of `currency` (e.g. XOF has 0 decimals). */
  costPerTonMinorUnits: bigint;
  currency: string;
}

/**
 * StockpileValuationService — STK-03, cost_model_version=1.
 *
 * v1 scope (Phase 2): carburant-only cost attribution.
 *   - Sum fuel_liters_consumed from contributing drilled_hole +
 *     extraction_cycle rows in the same operational_day + bench chain.
 *   - Multiply by fuel_tank_event.cost_per_liter (XOF) at that op-day.
 *   - Divide by tonnage to get cost-per-ton minor units.
 *
 * Until the fuel module wires real cost-per-liter (W3-P06 ADR-0007), this
 * service returns a deterministic zero-cost stub. The shape is final; only
 * the resolver implementation evolves. This is documented in ADR-0006
 * Implementation Notes (Task 5).
 *
 * Returns also the *weighted-average update inputs* for the projection
 * service (see {@link computeWeightedAverage}).
 */
@Injectable()
export class StockpileValuationService {
  async computeInflowCost(_input: InflowCostInput): Promise<InflowCost> {
    // Phase 2 stub — final wiring lands W3-P06 fuel module.
    // Returning XOF (UEMOA default currency) with zero cost keeps the
    // projection math well-defined while real attribution is unwired.
    return Promise.resolve({
      costPerTonMinorUnits: 0n,
      currency: 'XOF',
    });
  }

  /**
   * Weighted-average update applied on each INFLOW:
   *   new_avg = (old_avg * old_qty_t + new_cost_per_ton * new_qty_t)
   *             / (old_qty_t + new_qty_t)
   *
   * Operates entirely in minor units (bigint) — banker's rounding via
   * `dinero.js` is unnecessary here because the result is itself a per-ton
   * minor-unit value the caller will multiply back by tonnage downstream.
   *
   * Both qty inputs are kg; converting to tonnes simplifies algebra
   * symmetrically on top and bottom (kg cancels).
   */
  computeWeightedAverage(args: {
    oldAvgMinorUnits: bigint;
    oldBalanceKg: bigint;
    newCostPerTonMinorUnits: bigint;
    newInflowKg: bigint;
  }): bigint {
    const totalKg = args.oldBalanceKg + args.newInflowKg;
    if (totalKg <= 0n) return 0n;
    const num =
      args.oldAvgMinorUnits * args.oldBalanceKg +
      args.newCostPerTonMinorUnits * args.newInflowKg;
    // Integer division (truncation). Acceptable for cost_model_version=1.
    return num / totalKg;
  }
}
