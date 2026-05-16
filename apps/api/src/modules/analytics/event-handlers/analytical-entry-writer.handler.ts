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

/**
 * AnalyticalEntryWriterHandler (FIN-04).
 *
 * Writes analytical_entry rows for key financial events so OhadaExportService
 * has source material. Uses ON CONFLICT DO NOTHING for idempotency.
 *
 * Events handled:
 *   production.vte.bl_signed         → CREDIT entry for vente revenue
 *   maintenance.work_order.closed    → DEBIT entry for maintenance labor
 *   production.fuel.refuel_appended  → DEBIT entry for fuel consumption cost
 *
 * Each entry carries:
 *   - cost_center      : VTE | MNT | CAR
 *   - activity         : domain label
 *   - amount_minor_units : bigint, signed by debit_credit
 *   - source_table/id  : back-trace to the originating row
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
}
