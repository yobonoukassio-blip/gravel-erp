import {
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { BlastCharge } from '../entities/blast-charge.entity';
import { ExplosivesProductType } from '../entities/explosives-event.entity';
import { BlastPlanService } from './blast-plan.service';
import { DetonatorService } from './detonator.service';

export interface RecordBlastChargeInput {
  tenantId: string;
  blastPlanId: string;
  holeId: string;
  productType: ExplosivesProductType;
  plannedQtyG: bigint;
  actualQtyG: bigint;
  detonatorSerial?: string | null;
  operatorId: string;
}

/**
 * BlastChargeService — TIR-04.
 *
 * Records per-hole blast charges. blast_charge is append-only.
 * Variance_pct is computed server-side via GENERATED column.
 */
@Injectable()
export class BlastChargeService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly blastPlanService: BlastPlanService,
    private readonly detonatorService: DetonatorService,
  ) {}

  async recordCharge(input: RecordBlastChargeInput): Promise<BlastCharge> {
    const plan = await this.blastPlanService.findById(
      input.blastPlanId,
      input.tenantId,
    );
    if (plan.status !== 'LOADED') {
      throw new UnprocessableEntityException({
        code: 'ERR_BLAST_PLAN_NOT_LOADED',
        message: `Cannot record charge: blast plan ${input.blastPlanId} is in status=${plan.status}; expected LOADED.`,
      });
    }

    const id = randomUUID();
    const rows = (await this.ds.query(
      `INSERT INTO blast_charge (
         id, tenant_id, blast_plan_id, hole_id, product_type,
         planned_qty_g, actual_qty_g, detonator_serial, operator_id
       ) VALUES ($1, $2, $3, $4, $5::explosives_product_type, $6, $7, $8, $9)
       RETURNING id, occurred_at_utc, tenant_id, blast_plan_id, hole_id,
                 product_type, planned_qty_g, actual_qty_g, variance_pct,
                 detonator_serial, operator_id, created_at_utc`,
      [
        id,
        input.tenantId,
        input.blastPlanId,
        input.holeId,
        input.productType,
        input.plannedQtyG.toString(),
        input.actualQtyG.toString(),
        input.detonatorSerial ?? null,
        input.operatorId,
      ],
    )) as Array<Record<string, unknown>>;

    const saved = this.mapRow(rows[0]);

    // Update detonator status if a serial was provided
    if (input.detonatorSerial) {
      await this.detonatorService.load(
        input.detonatorSerial,
        saved.id,
        input.tenantId,
      );
    }

    return saved;
  }

  async listForBlastPlan(blastPlanId: string, tenantId: string): Promise<BlastCharge[]> {
    const rows = (await this.ds.query(
      `SELECT id, occurred_at_utc, tenant_id, blast_plan_id, hole_id,
              product_type, planned_qty_g, actual_qty_g, variance_pct,
              detonator_serial, operator_id, created_at_utc
         FROM blast_charge
        WHERE blast_plan_id = $1 AND tenant_id = $2
        ORDER BY created_at_utc ASC`,
      [blastPlanId, tenantId],
    )) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapRow(r));
  }

  private mapRow(r: Record<string, unknown>): BlastCharge {
    return {
      id: r['id'] as string,
      occurredAtUtc: new Date(r['occurred_at_utc'] as string | Date),
      tenantId: r['tenant_id'] as string,
      blastPlanId: r['blast_plan_id'] as string,
      holeId: r['hole_id'] as string,
      productType: r['product_type'] as ExplosivesProductType,
      plannedQtyG: String(r['planned_qty_g']),
      actualQtyG: String(r['actual_qty_g']),
      variancePct: r['variance_pct'] != null ? String(r['variance_pct']) : null,
      detonatorSerial: (r['detonator_serial'] as string | null) ?? null,
      operatorId: r['operator_id'] as string,
      createdAtUtc: new Date(r['created_at_utc'] as string | Date),
    };
  }
}
