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

/**
 * AnalyticalEntryWriterHandler (FIN-04).
 *
 * Writes analytical_entry rows for key financial events so OhadaExportService
 * has source material. Uses ON CONFLICT DO NOTHING for idempotency.
 *
 * Events handled:
 *   production.vte.bl_signed       → CREDIT entry for vente revenue
 *   maintenance.work_order.closed  → DEBIT entry for maintenance labor
 */
@Injectable()
export class AnalyticalEntryWriterHandler {
  private readonly logger = new Logger(AnalyticalEntryWriterHandler.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  @OnEvent('production.vte.bl_signed')
  async onBlSigned(evt: BlSignedEvent): Promise<void> {
    try {
      const rows = await this.ds.query<
        Array<{ site_id: string; unit_price_minor_units: string; currency: string; delivery_date: string }>
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
      this.logger.error(`analytical entry BL ${evt.blId}: ${(err as Error).message}`);
    }
  }

  @OnEvent('maintenance.work_order.closed')
  async onWorkOrderClosed(evt: WorkOrderClosedEvent): Promise<void> {
    try {
      // Amount=0 until labor rates are configured (Phase 6 FIN-07)
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
      this.logger.error(`analytical entry WO ${evt.workOrderId}: ${(err as Error).message}`);
    }
  }
}
