import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

interface BlSignedEvent {
  tenantId: string;
  blId: string;
  calibreCode: string;
  tonnageKg: string;
  signedAtUtc: string;
}

interface WorkOrderClosedEvent {
  tenantId: string;
  workOrderId: string;
  siteId: string;
  laborHours: string;
  closedAtUtc: string;
}

interface FuelRefuelAppendedEvent {
  tenantId: string;
  siteId: string;
  tankId: string;
  equipmentId: string;
  refuelId: string;
  liters: number;
}

interface ExtractionCycleRecordedEvent {
  tenantId: string;
  siteId: string;
  cycleId: string;
  operationalDayId: string;
  equipmentId: string;
  operatorId: string;
  materialType: string;
  estimatedTonnageT: number;
  downtimeMinutes?: number | null;
}

interface RotationCompletedEvent {
  tenant_id: string;
  site_id: string;
  rotation_id: string;
  weighing_ticket_id: string;
  loaded_tonnage_t: string;
  material_type: string;
  stockpile_id_target: string;
  operational_day_id: string;
  occurred_at_utc: string;
}

interface CrusherSessionCompletedEvent {
  session_id: string;
  tenant_id: string;
  site_id: string;
  operational_day_id: string;
  crusher_id: string;
  output_stockpile_id: string;
  output_tonnage_kg: number;
  input_tonnage_kg: number;
  material_type: string;
  calibre_code: string;
  energy_kwh: number;
  operator_id: string;
  completed_at_utc: string;
}

interface ScreeningSessionCompletedEvent {
  session_id: string;
  tenant_id: string;
  site_id: string;
  operational_day_id: string;
  screen_id: string;
  input_tonnage_kg: number;
  calibre_yields: Array<Record<string, unknown>>;
  operator_id: string;
  completed_at_utc: string;
}

// Placeholder unit costs (XOF per unit), centime minor units.
// Replace via rate-config service in FIN-07 refinement sprint.
const EXTRACTION_HOURLY_RATE_MINOR = 3500_00n; // 3500 XOF/h equipment placeholder
const TRANSPORT_PER_ROTATION_MINOR = 5000_00n; // 5000 XOF/rotation placeholder
const CONCASSAGE_PER_KWH_MINOR = 120_00n; // 120 XOF/kWh placeholder
const CRIBLAGE_HOURLY_RATE_MINOR = 2000_00n; // 2000 XOF/h placeholder

/**
 * AnalyticalEntryWriterHandler (FIN-04 + FIN-R01).
 *
 * Writes analytical_entry rows for key financial events so OhadaExportService
 * has source material AND CostPerTonAggregatorService has real cost ledger data
 * (Phase 7 FIN-R01).
 *
 * Events handled:
 *   production.vte.bl_signed                  → CREDIT VTE vente
 *   maintenance.work_order.closed             → DEBIT  MNT maintenance
 *   production.fuel.refuel_appended           → DEBIT  CAR carburant
 *   production.extraction.cycle_recorded      → DEBIT  EXT extraction       (FIN-R01)
 *   production.transport.rotation_completed   → DEBIT  TRA transport        (FIN-R01)
 *   production.crusher.session_completed      → DEBIT  CON concassage       (FIN-R01)
 *   production.screening.session_completed    → DEBIT  CRI criblage         (FIN-R01)
 *
 * Idempotency is enforced by UNIQUE(tenant_id, source_table, source_id, cost_center).
 */
@Injectable()
export class AnalyticalEntryWriterHandler {
  private readonly logger = new Logger(AnalyticalEntryWriterHandler.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  @OnEvent('production.vte.bl_signed')
  async onBlSigned(evt: BlSignedEvent): Promise<void> {
    try {
      const rows = await this.ds.query<
        Array<{
          site_id: string;
          unit_price_minor_units: string;
          currency: string;
          delivery_date: string;
        }>
      >(
        `SELECT bl.site_id, bl.delivery_date,
                sc.unit_price_minor_units, sc.currency
         FROM bon_de_livraison bl
         JOIN sale_contract sc ON sc.id = bl.sale_contract_id
         WHERE bl.id = $1 AND bl.tenant_id = $2`,
        [evt.blId, evt.tenantId],
      );

      if (rows.length === 0) {
        this.logger.warn(`BL ${evt.blId} not found for analytical entry`);
        return;
      }

      const row = rows[0];
      // Revenue in minor units: (tonnage_grams * unit_price_per_ton) / 1_000_000
      const tonnageGrams = BigInt(Math.round(parseFloat(evt.tonnageKg) * 1000));
      const unitPrice = BigInt(row.unit_price_minor_units);
      const revenueMinor = (tonnageGrams * unitPrice) / 1_000_000n;

      await this.ds.query(
        `INSERT INTO analytical_entry
           (tenant_id, site_id, entry_date, cost_center, activity, label,
            amount_minor_units, currency, debit_credit, source_table, source_id)
         VALUES ($1, $2, $3, 'VTE', 'vente', $4, $5, $6, 'C', 'bon_de_livraison', $7)
         ON CONFLICT (tenant_id, source_table, source_id, cost_center) DO NOTHING`,
        [
          evt.tenantId,
          row.site_id,
          row.delivery_date,
          `Vente ${evt.calibreCode}`,
          revenueMinor.toString(),
          row.currency,
          evt.blId,
        ],
      );
    } catch (err) {
      this.logger.error(
        `analytical entry BL ${evt.blId}: ${(err as Error).message}`,
      );
    }
  }

  @OnEvent('maintenance.work_order.closed')
  async onWorkOrderClosed(evt: WorkOrderClosedEvent): Promise<void> {
    try {
      // Amount=0 until labor rates are configured (Phase 6 FIN-07).
      // Entry is still written so the OHADA export carries the WO close event;
      // the rate-config refinement sprint will UPDATE amount_minor_units in-place.
      await this.ds.query(
        `INSERT INTO analytical_entry
           (tenant_id, site_id, entry_date, cost_center, activity, label,
            amount_minor_units, currency, debit_credit, source_table, source_id)
         VALUES ($1, $2, $3, 'MNT', 'maintenance', $4, '0', 'XOF', 'D', 'work_order', $5)
         ON CONFLICT (tenant_id, source_table, source_id, cost_center) DO NOTHING`,
        [
          evt.tenantId,
          evt.siteId,
          new Date(evt.closedAtUtc).toISOString().split('T')[0],
          `OT clôture — ${evt.laborHours}h`,
          evt.workOrderId,
        ],
      );
    } catch (err) {
      this.logger.error(
        `analytical entry WO ${evt.workOrderId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * production.fuel.refuel_appended — fuel cost entry (FIN-04 fuel coverage).
   *
   * Reads cost_per_liter from equipment_fuel_consumption (already populated
   * by the refuel service at the time of the refuel), computes
   * cost = liters × cost_per_liter, and writes a DEBIT analytical_entry
   * on the equipment's site, dated to the refuel's operational_day.
   */
  @OnEvent('production.fuel.refuel_appended')
  async onFuelRefuelAppended(evt: FuelRefuelAppendedEvent): Promise<void> {
    try {
      const rows = await this.ds.query<
        Array<{
          cost_per_liter_minor_units: string | null;
          currency: string | null;
          op_day_local: string | null;
        }>
      >(
        `SELECT efc.cost_per_liter_minor_units,
                efc.currency,
                od.day_local AS op_day_local
         FROM equipment_fuel_consumption efc
         JOIN operational_days od ON od.id = efc.operational_day_id
         WHERE efc.refuel_id = $1 AND efc.tenant_id = $2
         LIMIT 1`,
        [evt.refuelId, evt.tenantId],
      );

      if (rows.length === 0) {
        this.logger.warn(
          `consumption row for refuel ${evt.refuelId} not found — skipping FIN-04 entry`,
        );
        return;
      }

      const row = rows[0];
      // Without a known cost_per_liter (no fuel delivery yet recorded), we
      // still write a zero-amount entry to keep the audit trail traceable
      // and let the refinement sprint backfill it once a rate is published.
      const costPerLiter = row.cost_per_liter_minor_units
        ? BigInt(row.cost_per_liter_minor_units)
        : 0n;
      const litersScaled = BigInt(Math.round(evt.liters * 100));
      const costMinor = (litersScaled * costPerLiter) / 100n;
      const currency = row.currency ?? 'XOF';
      const entryDate =
        row.op_day_local ?? new Date().toISOString().split('T')[0];

      await this.ds.query(
        `INSERT INTO analytical_entry
           (tenant_id, site_id, entry_date, cost_center, activity, label,
            amount_minor_units, currency, debit_credit, source_table, source_id)
         VALUES ($1, $2, $3, 'CAR', 'carburant', $4, $5, $6, 'D', 'equipment_refuel', $7)
         ON CONFLICT (tenant_id, source_table, source_id, cost_center) DO NOTHING`,
        [
          evt.tenantId,
          evt.siteId,
          entryDate,
          `Ravitaillement ${evt.liters.toFixed(2)} L`,
          costMinor.toString(),
          currency,
          evt.refuelId,
        ],
      );
    } catch (err) {
      this.logger.error(
        `analytical entry refuel ${evt.refuelId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * FIN-R01: extraction cycle → DEBIT EXT entry.
   *
   * Looks up the cycle's elapsed time and downtime to compute operating hours,
   * multiplies by an extraction equipment placeholder hourly rate.
   * Date sourced from operational_days.business_date for the cycle.
   */
  @OnEvent('production.extraction.cycle_recorded')
  async onExtractionCycleRecorded(
    evt: ExtractionCycleRecordedEvent,
  ): Promise<void> {
    try {
      const rows = await this.ds.query<
        Array<{
          business_date: string;
          cycle_started_at_local: string;
          cycle_ended_at_local: string;
          downtime_minutes: number | null;
        }>
      >(
        `SELECT od.business_date,
                ec.cycle_started_at_local,
                ec.cycle_ended_at_local,
                ec.downtime_minutes
         FROM extraction_cycle ec
         JOIN operational_days od ON od.id = ec.operational_day_id
         WHERE ec.id = $1 AND ec.tenant_id = $2
         LIMIT 1`,
        [evt.cycleId, evt.tenantId],
      );

      if (rows.length === 0) {
        this.logger.warn(
          `extraction_cycle ${evt.cycleId} not found — skipping FIN-R01 entry`,
        );
        return;
      }

      const row = rows[0];
      const elapsedMs =
        new Date(row.cycle_ended_at_local).getTime() -
        new Date(row.cycle_started_at_local).getTime();
      const elapsedHours = Math.max(
        0,
        elapsedMs / 3600000 - (row.downtime_minutes ?? 0) / 60,
      );
      // cost_minor = hours_scaled * rate_minor / 100  (preserve 2-decimal precision)
      const hoursScaled = BigInt(Math.round(elapsedHours * 100));
      const costMinor = (hoursScaled * EXTRACTION_HOURLY_RATE_MINOR) / 100n;

      await this.ds.query(
        `INSERT INTO analytical_entry
           (tenant_id, site_id, entry_date, cost_center, activity, label,
            amount_minor_units, currency, debit_credit, source_table, source_id)
         VALUES ($1, $2, $3, 'EXT', 'extraction', $4, $5, 'XOF', 'D', 'extraction_cycle', $6)
         ON CONFLICT (tenant_id, source_table, source_id, cost_center) DO NOTHING`,
        [
          evt.tenantId,
          evt.siteId,
          row.business_date,
          `Extraction cycle ${elapsedHours.toFixed(2)}h`,
          costMinor.toString(),
          evt.cycleId,
        ],
      );
    } catch (err) {
      this.logger.error(
        `analytical entry extraction cycle ${evt.cycleId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * FIN-R01: truck rotation completed → DEBIT TRA entry.
   *
   * Flat per-rotation cost placeholder; refined to fuel + driver + truck depreciation
   * pro-rata in the FIN-07 refinement sprint.
   */
  @OnEvent('production.transport.rotation_completed')
  async onRotationCompleted(evt: RotationCompletedEvent): Promise<void> {
    try {
      const rows = await this.ds.query<Array<{ business_date: string }>>(
        `SELECT business_date FROM operational_days WHERE id = $1 LIMIT 1`,
        [evt.operational_day_id],
      );

      if (rows.length === 0) {
        this.logger.warn(
          `operational_day ${evt.operational_day_id} not found — skipping FIN-R01 rotation entry`,
        );
        return;
      }

      const entryDate = rows[0].business_date;

      await this.ds.query(
        `INSERT INTO analytical_entry
           (tenant_id, site_id, entry_date, cost_center, activity, label,
            amount_minor_units, currency, debit_credit, source_table, source_id)
         VALUES ($1, $2, $3, 'TRA', 'transport', $4, $5, 'XOF', 'D', 'truck_rotation', $6)
         ON CONFLICT (tenant_id, source_table, source_id, cost_center) DO NOTHING`,
        [
          evt.tenant_id,
          evt.site_id,
          entryDate,
          `Rotation ${evt.loaded_tonnage_t}t`,
          TRANSPORT_PER_ROTATION_MINOR.toString(),
          evt.rotation_id,
        ],
      );
    } catch (err) {
      this.logger.error(
        `analytical entry rotation ${evt.rotation_id}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * FIN-R01: crusher session completed → DEBIT CON entry.
   *
   * cost = energy_kwh × per-kWh placeholder. Refined when energy-tariff master-data
   * arrives in FIN-07.
   */
  @OnEvent('production.crusher.session_completed')
  async onCrusherSessionCompleted(
    evt: CrusherSessionCompletedEvent,
  ): Promise<void> {
    try {
      const rows = await this.ds.query<Array<{ business_date: string }>>(
        `SELECT business_date FROM operational_days WHERE id = $1 LIMIT 1`,
        [evt.operational_day_id],
      );

      if (rows.length === 0) {
        this.logger.warn(
          `operational_day ${evt.operational_day_id} not found — skipping FIN-R01 crusher entry`,
        );
        return;
      }

      const entryDate = rows[0].business_date;
      const energyKwh = Number(evt.energy_kwh ?? 0);
      const kwhScaled = BigInt(Math.round(energyKwh * 100));
      const costMinor = (kwhScaled * CONCASSAGE_PER_KWH_MINOR) / 100n;

      await this.ds.query(
        `INSERT INTO analytical_entry
           (tenant_id, site_id, entry_date, cost_center, activity, label,
            amount_minor_units, currency, debit_credit, source_table, source_id)
         VALUES ($1, $2, $3, 'CON', 'concassage', $4, $5, 'XOF', 'D', 'crusher_session', $6)
         ON CONFLICT (tenant_id, source_table, source_id, cost_center) DO NOTHING`,
        [
          evt.tenant_id,
          evt.site_id,
          entryDate,
          `Concassage ${energyKwh.toFixed(2)} kWh`,
          costMinor.toString(),
          evt.session_id,
        ],
      );
    } catch (err) {
      this.logger.error(
        `analytical entry crusher session ${evt.session_id}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * FIN-R01: screening session completed → DEBIT CRI entry.
   *
   * cost = operating_hours × placeholder rate. Operating hours derived from
   * session_start/end on the screening_session row.
   */
  @OnEvent('production.screening.session_completed')
  async onScreeningSessionCompleted(
    evt: ScreeningSessionCompletedEvent,
  ): Promise<void> {
    try {
      const rows = await this.ds.query<
        Array<{
          business_date: string;
          session_start_utc: string;
          session_end_utc: string | null;
        }>
      >(
        `SELECT od.business_date,
                ss.session_start_utc,
                ss.session_end_utc
         FROM screening_session ss
         JOIN operational_days od ON od.id = ss.operational_day_id
         WHERE ss.id = $1 AND ss.tenant_id = $2
         LIMIT 1`,
        [evt.session_id, evt.tenant_id],
      );

      if (rows.length === 0) {
        this.logger.warn(
          `screening_session ${evt.session_id} not found — skipping FIN-R01 entry`,
        );
        return;
      }

      const row = rows[0];
      const startMs = new Date(row.session_start_utc).getTime();
      const endMs = row.session_end_utc
        ? new Date(row.session_end_utc).getTime()
        : new Date(evt.completed_at_utc).getTime();
      const operatingHours = Math.max(0, (endMs - startMs) / 3600000);
      const hoursScaled = BigInt(Math.round(operatingHours * 100));
      const costMinor = (hoursScaled * CRIBLAGE_HOURLY_RATE_MINOR) / 100n;

      await this.ds.query(
        `INSERT INTO analytical_entry
           (tenant_id, site_id, entry_date, cost_center, activity, label,
            amount_minor_units, currency, debit_credit, source_table, source_id)
         VALUES ($1, $2, $3, 'CRI', 'criblage', $4, $5, 'XOF', 'D', 'screening_session', $6)
         ON CONFLICT (tenant_id, source_table, source_id, cost_center) DO NOTHING`,
        [
          evt.tenant_id,
          evt.site_id,
          row.business_date,
          `Criblage ${operatingHours.toFixed(2)}h`,
          costMinor.toString(),
          evt.session_id,
        ],
      );
    } catch (err) {
      this.logger.error(
        `analytical entry screening session ${evt.session_id}: ${(err as Error).message}`,
      );
    }
  }
}
