import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CostPerTonSnapshot } from '../entities/cost-per-ton-snapshot.entity';

interface AggregateDto {
  tenantId: string;
  siteId: string;
  snapshotDate: string;
  calibreCode: string;
  pivotCurrency?: string;
}

/**
 * CostPerTonAggregatorService (FIN-01).
 *
 * Computes daily cost-per-ton snapshot from operational data.
 * Components (all bigint minor units):
 *   - extraction: labor_hours × hourly_rate from extraction_cycle
 *   - transport: rotation_count × per_rotation_cost from truck_rotation
 *   - concassage: crusher_session energy_kwh × kwh_rate
 *   - criblage: screening_session labor
 *   - carburant: fuel_cost_allocator output for the day
 *   - main_oeuvre: shift_entry × hourly_rate
 *   - amortissement: production_equipment depreciation linear pro-rata
 *
 * Always provisional (is_provisional=true) unless month-end revaluation runs.
 * Output is materialized into cost_per_ton_snapshot for fast dashboard reads.
 */
@Injectable()
export class CostPerTonAggregatorService {
  private readonly logger = new Logger(CostPerTonAggregatorService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async aggregateForDate(dto: AggregateDto): Promise<CostPerTonSnapshot> {
    const pivot = dto.pivotCurrency ?? 'XOF';

    // 1. Tonnage produced for this site × calibre × date (from stockpile INFLOW events)
    const [tonnageRow] = await this.ds.query<Array<{ tonnage_kg: string | null }>>(
      `SELECT COALESCE(SUM(tonnage_delta_kg), 0)::bigint AS tonnage_kg
       FROM stockpile_event
       WHERE tenant_id = $1
         AND event_type = 'STOCKPILE_INFLOW'
         AND calibre_code = $2
         AND occurred_at_utc::date = $3
         AND stockpile_id IN (SELECT id FROM stockpile WHERE site_id = $4)`,
      [dto.tenantId, dto.calibreCode, dto.snapshotDate, dto.siteId],
    );
    const tonnageKg = BigInt(tonnageRow?.tonnage_kg ?? 0);
    const tonnageT = Number(tonnageKg) / 1000;

    // 2. Fuel cost (uses FuelCostAllocator pattern from Phase 2 W3-P06 SUMMARY)
    const [fuelRow] = await this.ds.query<Array<{ cost: string | null }>>(
      `SELECT COALESCE(SUM(er.litres_dispensed * 800), 0)::bigint AS cost
       FROM equipment_refuel er
       WHERE er.tenant_id = $1
         AND er.refueled_at_utc::date = $2
         AND er.equipment_id IN (
           SELECT id FROM production_equipment WHERE site_id = $3
         )`,
      [dto.tenantId, dto.snapshotDate, dto.siteId],
    );
    const costCarburantMinor = BigInt(fuelRow?.cost ?? 0);

    // 3. Maintenance/labor cost from work orders closed that day
    const [woRow] = await this.ds.query<Array<{ labor_hours: string | null }>>(
      `SELECT COALESCE(SUM(labor_hours), 0)::numeric AS labor_hours
       FROM work_order
       WHERE tenant_id = $1
         AND closed_at_utc::date = $2
         AND equipment_id IN (
           SELECT id FROM production_equipment WHERE site_id = $3
         )`,
      [dto.tenantId, dto.snapshotDate, dto.siteId],
    );
    const laborHours = Number(woRow?.labor_hours ?? 0);
    const hourlyRateMinor = 2500_00n; // 2500 XOF/h placeholder — replace via RH rate config
    const costMainOeuvreMinor = BigInt(Math.round(laborHours * 100)) * hourlyRateMinor / 100n;

    // 4. Transport rotation cost (basic: 5000 XOF/rotation placeholder)
    const [rotRow] = await this.ds.query<Array<{ c: string | null }>>(
      `SELECT COUNT(*) AS c FROM truck_rotation
       WHERE tenant_id = $1
         AND operational_day_id IN (
           SELECT id FROM operational_day WHERE date = $2 AND site_id = $3
         )`,
      [dto.tenantId, dto.snapshotDate, dto.siteId],
    );
    const costTransportMinor = BigInt(rotRow?.c ?? 0) * 5000_00n;

    // Other components stubbed at 0 (refined in subsequent iterations)
    const costExtractionMinor = 0n;
    const costConcassageMinor = 0n;
    const costCriblageMinor = 0n;
    const costAmortissementMinor = 0n;

    const totalCostMinor =
      costExtractionMinor +
      costTransportMinor +
      costConcassageMinor +
      costCriblageMinor +
      costCarburantMinor +
      costMainOeuvreMinor +
      costAmortissementMinor;

    const costPerTonMinor =
      tonnageT > 0
        ? totalCostMinor / BigInt(Math.max(1, Math.round(tonnageT * 100))) * 100n
        : 0n;

    // Upsert snapshot
    const result = await this.ds
      .createQueryBuilder()
      .insert()
      .into(CostPerTonSnapshot)
      .values({
        tenantId: dto.tenantId,
        siteId: dto.siteId,
        snapshotDate: dto.snapshotDate,
        materialType: 'granite_brut',
        calibreCode: dto.calibreCode,
        tonnageProducedT: tonnageT.toFixed(2),
        costExtractionMinor: costExtractionMinor.toString(),
        costTransportMinor: costTransportMinor.toString(),
        costConcassageMinor: costConcassageMinor.toString(),
        costCriblageMinor: costCriblageMinor.toString(),
        costCarburantMinor: costCarburantMinor.toString(),
        costMainOeuvreMinor: costMainOeuvreMinor.toString(),
        costAmortissementMinor: costAmortissementMinor.toString(),
        totalCostMinor: totalCostMinor.toString(),
        costPerTonMinor: costPerTonMinor.toString(),
        currency: pivot,
        isProvisional: true,
      })
      .orUpdate(
        [
          'tonnage_produced_t',
          'cost_extraction_minor',
          'cost_transport_minor',
          'cost_concassage_minor',
          'cost_criblage_minor',
          'cost_carburant_minor',
          'cost_main_oeuvre_minor',
          'cost_amortissement_minor',
          'total_cost_minor',
          'cost_per_ton_minor',
        ],
        ['tenant_id', 'site_id', 'snapshot_date', 'calibre_code'],
      )
      .returning('*')
      .execute();

    return result.raw[0] as CostPerTonSnapshot;
  }
}
