import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RhHabilitationService } from '../../rh/services/rh-habilitation.service';
import { BlastPlan, BlastPlanStatus } from '../entities/blast-plan.entity';

export interface CreateBlastPlanInput {
  tenantId: string;
  siteId: string;
  operationalDayId: string;
  drillingPlanId: string;
  plannedBy: string;
  notesMd?: string | null;
}

/**
 * BlastPlanService — TIR-03, TIR-05.
 *
 * Manages the blast plan state machine. Habilitation checks use the
 * explicit `shiftStartLocal` date from the operational day — NEVER `new Date()`
 * (Pitfall 2 of ADR-0012).
 *
 * State transitions:
 *   DRAFT → HSE_APPROVED (approveHse)
 *   HSE_APPROVED → LOADED (approveLoading — requires TIR_MINE_CI cert)
 *   LOADED → FIRE_REQUESTED (requestFire — requires TIR_SUPERVISOR_CI cert)
 *   FIRE_REQUESTED|CLEARED → FIRED (transitionToFired — called by saga)
 *   FIRED → REPORTED (by BlastReportService after report creation)
 */
@Injectable()
export class BlastPlanService {
  private readonly logger = new Logger(BlastPlanService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly rhHabilitationService: RhHabilitationService,
    private readonly events: EventEmitter2,
  ) {}

  async create(input: CreateBlastPlanInput): Promise<BlastPlan> {
    const rows = (await this.ds.query(
      `INSERT INTO blast_plan (
         tenant_id, site_id, operational_day_id, drilling_plan_id,
         planned_by, notes_md, status
       ) VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT')
       RETURNING *`,
      [
        input.tenantId,
        input.siteId,
        input.operationalDayId,
        input.drillingPlanId,
        input.plannedBy,
        input.notesMd ?? null,
      ],
    )) as Array<Record<string, unknown>>;
    return this.mapRow(rows[0]);
  }

  async findById(planId: string, tenantId: string): Promise<BlastPlan> {
    const rows = (await this.ds.query(
      `SELECT * FROM blast_plan WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [planId, tenantId],
    )) as Array<Record<string, unknown>>;
    if (rows.length === 0) {
      throw new NotFoundException({ code: 'ERR_BLAST_PLAN_NOT_FOUND', planId });
    }
    return this.mapRow(rows[0]);
  }

  async approveHse(planId: string, hseOfficerId: string, tenantId: string): Promise<BlastPlan> {
    const plan = await this.findById(planId, tenantId);
    this.assertStatus(plan, ['DRAFT'], 'approveHse');

    const rows = (await this.ds.query(
      `UPDATE blast_plan
          SET status = 'HSE_APPROVED',
              hse_approved_by = $1,
              hse_approved_at_utc = now()
        WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [hseOfficerId, planId, tenantId],
    )) as Array<Record<string, unknown>>;
    this.logger.log(`[BlastPlan] ${planId} DRAFT→HSE_APPROVED by ${hseOfficerId}`);
    return this.mapRow(rows[0]);
  }

  /**
   * Approve loading. Requires TIR_MINE_CI habilitation as of the operational
   * day shift start — NEVER new Date().
   */
  async approveLoading(
    planId: string,
    operatorId: string,
    operationalDay: { id: string; shiftStartLocal: Date },
    tenantId: string,
  ): Promise<BlastPlan> {
    const plan = await this.findById(planId, tenantId);
    this.assertStatus(plan, ['HSE_APPROVED'], 'approveLoading');

    const valid = await this.rhHabilitationService.isValidAt(
      operatorId,
      'TIR_MINE_CI',
      operationalDay.shiftStartLocal, // NEVER new Date() — Pitfall 2
    );
    if (!valid) {
      throw new ForbiddenException({
        code: 'ERR_HABILITATION_EXPIRED',
        message: `Operator ${operatorId} does not hold a valid TIR_MINE_CI certification on ${operationalDay.shiftStartLocal.toISOString().slice(0, 10)}.`,
      });
    }

    const rows = (await this.ds.query(
      `UPDATE blast_plan
          SET status = 'LOADED',
              loading_operator_id = $1,
              loading_approved_at_utc = now()
        WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [operatorId, planId, tenantId],
    )) as Array<Record<string, unknown>>;
    this.logger.log(`[BlastPlan] ${planId} HSE_APPROVED→LOADED by operator ${operatorId}`);
    return this.mapRow(rows[0]);
  }

  /**
   * Request fire clearance. Requires TIR_SUPERVISOR_CI cert.
   * Emits 'tir.blast_plan.fire_requested' — picked up by clearance timeout job.
   */
  async requestFire(
    planId: string,
    supervisorId: string,
    operationalDay: { id: string; shiftStartLocal: Date },
    tenantId: string,
  ): Promise<BlastPlan> {
    const plan = await this.findById(planId, tenantId);
    this.assertStatus(plan, ['LOADED'], 'requestFire');

    const valid = await this.rhHabilitationService.isValidAt(
      supervisorId,
      'TIR_SUPERVISOR_CI',
      operationalDay.shiftStartLocal, // NEVER new Date() — Pitfall 2
    );
    if (!valid) {
      throw new ForbiddenException({
        code: 'ERR_HABILITATION_EXPIRED',
        message: `Supervisor ${supervisorId} does not hold a valid TIR_SUPERVISOR_CI certification.`,
      });
    }

    const rows = (await this.ds.query(
      `UPDATE blast_plan
          SET status = 'FIRE_REQUESTED',
              fire_requested_at_utc = now()
        WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [supervisorId, planId, tenantId],
    )) as Array<Record<string, unknown>>;
    const saved = this.mapRow(rows[0]);

    this.events.emit('tir.blast_plan.fire_requested', {
      planId: saved.id,
      siteId: saved.siteId,
      tenantId: saved.tenantId,
    });
    this.logger.log(`[BlastPlan] ${planId} LOADED→FIRE_REQUESTED by supervisor ${supervisorId}`);
    return saved;
  }

  /**
   * Transition to FIRED — called by BlastClearanceSaga when zone_cleared event
   * is received. NOT a public HTTP endpoint.
   */
  async transitionToFired(planId: string, tenantId: string): Promise<BlastPlan> {
    const plan = await this.findById(planId, tenantId);
    this.assertStatus(plan, ['FIRE_REQUESTED', 'CLEARED'], 'transitionToFired');

    const rows = (await this.ds.query(
      `UPDATE blast_plan
          SET status = 'FIRED',
              fired_at_utc = now()
        WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [planId, tenantId],
    )) as Array<Record<string, unknown>>;
    this.logger.log(`[BlastPlan] ${planId} →FIRED`);
    return this.mapRow(rows[0]);
  }

  /** Transition FIRED → REPORTED (called by BlastReportService). */
  async transitionToReported(planId: string, tenantId: string): Promise<BlastPlan> {
    const plan = await this.findById(planId, tenantId);
    this.assertStatus(plan, ['FIRED'], 'transitionToReported');

    const rows = (await this.ds.query(
      `UPDATE blast_plan SET status = 'REPORTED' WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [planId, tenantId],
    )) as Array<Record<string, unknown>>;
    return this.mapRow(rows[0]);
  }

  private assertStatus(
    plan: BlastPlan,
    allowed: BlastPlanStatus[],
    op: string,
  ): void {
    if (!allowed.includes(plan.status)) {
      throw new UnprocessableEntityException({
        code: 'ERR_BLAST_PLAN_INVALID_STATUS',
        message: `Cannot ${op}: plan ${plan.id} is in status=${plan.status}; expected one of [${allowed.join(', ')}].`,
      });
    }
  }

  mapRow(r: Record<string, unknown>): BlastPlan {
    return {
      id: r['id'] as string,
      tenantId: r['tenant_id'] as string,
      siteId: r['site_id'] as string,
      operationalDayId: r['operational_day_id'] as string,
      drillingPlanId: r['drilling_plan_id'] as string,
      status: r['status'] as BlastPlanStatus,
      plannedBy: r['planned_by'] as string,
      hseApprovedBy: (r['hse_approved_by'] as string | null) ?? null,
      hseApprovedAtUtc: r['hse_approved_at_utc'] ? new Date(r['hse_approved_at_utc'] as string) : null,
      loadingOperatorId: (r['loading_operator_id'] as string | null) ?? null,
      loadingApprovedAtUtc: r['loading_approved_at_utc'] ? new Date(r['loading_approved_at_utc'] as string) : null,
      fireRequestedAtUtc: r['fire_requested_at_utc'] ? new Date(r['fire_requested_at_utc'] as string) : null,
      clearanceToken: (r['clearance_token'] as string | null) ?? null,
      firedAtUtc: r['fired_at_utc'] ? new Date(r['fired_at_utc'] as string) : null,
      notesMd: (r['notes_md'] as string | null) ?? null,
      version: Number(r['version']),
      createdAtUtc: new Date(r['created_at_utc'] as string | Date),
      updatedAtUtc: new Date(r['updated_at_utc'] as string | Date),
    };
  }
}
