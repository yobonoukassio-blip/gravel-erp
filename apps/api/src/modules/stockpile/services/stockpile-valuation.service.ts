import { Inject, Injectable, Optional } from '@nestjs/common';
import { FuelCostAllocatorService } from '../../fuel/services/fuel-cost-allocator.service';

export interface InflowCostInput {
  tenantId: string;
  rotationId: string;
  operationalDayId: string;
  siteId?: string;
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
  constructor(
    @Optional()
    @Inject(FuelCostAllocatorService)
    private readonly fuelAllocator?: FuelCostAllocatorService,
  ) {}

  async computeInflowCost(input: InflowCostInput): Promise<InflowCost> {
    // W3-P06 wiring: delegate to FuelCostAllocatorService when wired
    // (FuelModule imports). Falls back to XOF/0 when running in test
    // contexts that do not provide the fuel module.
    if (!this.fuelAllocator) {
      return { costPerTonMinorUnits: 0n, currency: 'XOF' };
    }
    const result = await this.fuelAllocator.allocateFuelCostForOperationalDay({
      tenantId: input.tenantId,
      siteId: input.siteId ?? '',
      operationalDayId: input.operationalDayId,
      tonnageKg: input.loadedTonnageKg,
    });
    return {
      costPerTonMinorUnits: result.costPerTonMinorUnits,
      currency: result.currency,
    };
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
