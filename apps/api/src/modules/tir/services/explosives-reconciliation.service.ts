import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface ExplosivesBalance {
  [productType: string]: number;
}

export interface PhysicalCountInput {
  operationalDayId: string;
  productType: string;
  quantityG: number;
  submittedBy: string;
  reason: string;
  overrideAuthorizedBy: string;
}

/**
 * ExplosivesReconciliationService — TIR-07.
 *
 * Computes ledger balance from explosives_event rows and compares against
 * manual physical count entries.
 */
@Injectable()
export class ExplosivesReconciliationService {
  private readonly logger = new Logger(ExplosivesReconciliationService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /**
   * Sum all explosives_event.quantity_g grouped by product_type for a given
   * operational day. Returns a map of productType → net grams.
   */
  async computeBalance(
    siteId: string,
    operationalDayId: string,
    tenantId: string,
  ): Promise<ExplosivesBalance> {
    const rows = (await this.ds.query(
      `SELECT product_type, COALESCE(SUM(quantity_g), 0) AS total_g
         FROM explosives_event
        WHERE tenant_id = $1 AND site_id = $2 AND operational_day_id = $3
        GROUP BY product_type`,
      [tenantId, siteId, operationalDayId],
    )) as Array<{ product_type: string; total_g: string }>;

    const balance: ExplosivesBalance = {};
    for (const row of rows) {
      balance[row.product_type] = parseInt(row.total_g, 10);
    }
    return balance;
  }

  /** Fetch all physical count entries for an operational day. */
  async getPhysicalCount(
    operationalDayId: string,
    _tenantId: string,
  ): Promise<ExplosivesBalance> {
    const rows = (await this.ds.query(
      `SELECT product_type, quantity_g
         FROM explosives_physical_count
        WHERE operational_day_id = $1`,
      [operationalDayId],
    )) as Array<{ product_type: string; quantity_g: string }>;

    const counts: ExplosivesBalance = {};
    for (const row of rows) {
      counts[row.product_type] = parseInt(row.quantity_g, 10);
    }
    return counts;
  }

  /** Compute absolute gap in grams between ledger and physical count. */
  computeGap(ledger: ExplosivesBalance, physical: ExplosivesBalance): number {
    const allTypes = new Set([
      ...Object.keys(ledger),
      ...Object.keys(physical),
    ]);
    let totalGap = 0;
    for (const pt of allTypes) {
      const ledgerQty = ledger[pt] ?? 0;
      const physicalQty = physical[pt] ?? 0;
      totalGap += Math.abs(ledgerQty - physicalQty);
    }
    return totalGap;
  }

  /** Record a manual physical count submission. */
  async recordPhysicalCount(
    input: PhysicalCountInput,
    _tenantId: string,
  ): Promise<void> {
    await this.ds.query(
      `INSERT INTO explosives_physical_count (
         operational_day_id, product_type, quantity_g,
         submitted_by, reason, override_authorized_by
       ) VALUES ($1, $2::explosives_product_type, $3, $4, $5, $6)
       ON CONFLICT (operational_day_id, product_type)
       DO UPDATE SET
         quantity_g = EXCLUDED.quantity_g,
         submitted_by = EXCLUDED.submitted_by,
         reason = EXCLUDED.reason,
         override_authorized_by = EXCLUDED.override_authorized_by`,
      [
        input.operationalDayId,
        input.productType,
        input.quantityG,
        input.submittedBy,
        input.reason,
        input.overrideAuthorizedBy,
      ],
    );
    this.logger.log(
      `[ExplosivesRecon] Physical count recorded for day=${input.operationalDayId} type=${input.productType} qty=${input.quantityG}g`,
    );
  }
}
