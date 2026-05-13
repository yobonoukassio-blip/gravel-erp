import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface CostPerTonProvisionalResult {
  /** Amount in minor currency units (e.g. XOF has no decimal so 8000 = 8000 XOF). */
  amount_minor: bigint;
  /** ISO-4217 currency code for the site's functional currency. */
  currency: string;
  /** Mandatory label per D2-100. */
  label: 'cost_per_ton_provisional';
}

/**
 * CostPerTonProvisionalService (D2-100, DSH-02).
 *
 * Formula:
 *   cost_per_ton = SUM(fuel_liters × cost_per_liter_minor_units)
 *                  / (SUM(stockpile_inflow_tonnage_kg) / 1000)
 *
 * Fuel cost = equipment_fuel_consumption.liters × cost_per_liter_minor_units
 * sourced from the latest delivery event on each tank (FIFO not applied —
 * provisional means fuel cost only, final cost accounting is Phase 4).
 *
 * Returns 0 when no inflow tonnage exists (avoids division by zero).
 * Currency defaults to 'XOF' per UEMOA context; fetched from site record
 * when available.
 */
@Injectable()
export class CostPerTonProvisionalService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async compute(
    tenantId: string,
    siteId: string,
    operationalDayId: string,
  ): Promise<CostPerTonProvisionalResult> {
    // Step 1: sum fuel cost for the operational day
    const fuelRows = (await this.ds.query(
      `SELECT
         COALESCE(SUM(efc.liters * COALESCE(fte.cost_per_liter_minor_units, 0)), 0)::numeric
           AS total_fuel_cost_minor
       FROM equipment_fuel_consumption efc
       LEFT JOIN LATERAL (
         SELECT cost_per_liter_minor_units
         FROM fuel_tank_event fte2
         WHERE fte2.tenant_id = efc.tenant_id
           AND fte2.event_type = 'FUEL_DELIVERY_IN'
           AND fte2.created_at_utc <= efc.created_at_utc
         ORDER BY fte2.created_at_utc DESC
         LIMIT 1
       ) fte ON true
       WHERE efc.tenant_id = $1
         AND efc.site_id   = $2
         AND efc.operational_day_id = $3`,
      [tenantId, siteId, operationalDayId],
    )) as Array<{ total_fuel_cost_minor: string }>;

    const totalFuelCostMinor = BigInt(
      Math.round(Number(fuelRows[0]?.total_fuel_cost_minor ?? '0')),
    );

    // Step 2: sum inflow tonnage for the operational day
    const inflow = (await this.ds.query(
      `SELECT COALESCE(SUM(tonnage_delta_kg), 0)::numeric AS total_inflow_kg
       FROM stockpile_event
       WHERE tenant_id = $1
         AND site_id   = $2
         AND operational_day_id = $3
         AND event_type = 'STOCKPILE_INFLOW'`,
      [tenantId, siteId, operationalDayId],
    )) as Array<{ total_inflow_kg: string }>;

    const totalInflowKg = Number(inflow[0]?.total_inflow_kg ?? '0');
    const totalInflowT = totalInflowKg / 1000;

    // Step 3: determine site functional currency
    const currencyRow = (await this.ds.query(
      `SELECT COALESCE(functional_currency, 'XOF') AS currency
       FROM site
       WHERE tenant_id = $1 AND id = $2
       LIMIT 1`,
      [tenantId, siteId],
    )) as Array<{ currency: string }>;
    const currency = currencyRow[0]?.currency ?? 'XOF';

    // Step 4: compute — guard against zero inflow
    const amountMinor =
      totalInflowT > 0
        ? BigInt(Math.round(Number(totalFuelCostMinor) / totalInflowT))
        : 0n;

    return {
      amount_minor: amountMinor,
      currency,
      label: 'cost_per_ton_provisional',
    };
  }
}
