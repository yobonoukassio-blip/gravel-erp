import { randomUUID } from 'crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { OutboxService } from '../../outbox/outbox.service';
import {
  CalibreYield,
  ScreeningSession,
  ScreeningSessionStatus,
} from '../entities/screening-session.entity';

export interface OpenScreeningSessionDto {
  tenantId: string;
  siteId: string;
  operationalDayId: string;
  screenId: string;
  inputStockpileId?: string | null;
  operatorId: string;
  sessionStartUtc?: Date;
  notesMd?: string | null;
}

export interface CompleteScreeningSessionDto {
  inputTonnageKg: number;
  calibreYields: CalibreYield[];
  notesMd?: string | null;
  operatorId: string;
}

@Injectable()
export class ScreeningSessionService {
  private readonly logger = new Logger(ScreeningSessionService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly outboxService: OutboxService,
  ) {}

  async open(dto: OpenScreeningSessionDto): Promise<ScreeningSession> {
    const id = randomUUID();
    const now = dto.sessionStartUtc ?? new Date();

    const rows = (await this.ds.query(
      `INSERT INTO screening_session (
         id, tenant_id, site_id, operational_day_id, screen_id,
         input_stockpile_id, operator_id, session_start_utc, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ACTIVE')
       RETURNING *`,
      [
        id,
        dto.tenantId,
        dto.siteId,
        dto.operationalDayId,
        dto.screenId,
        dto.inputStockpileId ?? null,
        dto.operatorId,
        now,
      ],
    )) as Array<Record<string, unknown>>;

    return this.mapRow(rows[0]);
  }

  async pause(id: string): Promise<ScreeningSession> {
    return this.transitionStatus(id, 'ACTIVE', 'PAUSED');
  }

  async resume(id: string): Promise<ScreeningSession> {
    return this.transitionStatus(id, 'PAUSED', 'ACTIVE');
  }

  /**
   * Completes the screening session atomically:
   *  1. Validates calibre_yields: each is_nonconforming=true must have nonconformity_reason
   *  2. At minimum 1 calibre entry required
   *  3. Updates session + publishes ONE outbox event `production.screening.session_completed`
   *     in SAME transaction (atomicity)
   *
   * The outbox handler (ScreeningSessionCompletedHandler) will loop calibre_yields and
   * create one STOCKPILE_INFLOW per calibre with compound idempotency key.
   */
  async complete(
    id: string,
    dto: CompleteScreeningSessionDto,
    manager?: EntityManager,
  ): Promise<ScreeningSession> {
    this.validateCalibreYields(dto.calibreYields);

    const completedAt = new Date();

    const run = async (em: EntityManager): Promise<ScreeningSession> => {
      const existing = (await em.query(
        `SELECT * FROM screening_session WHERE id = $1 FOR UPDATE`,
        [id],
      )) as Array<Record<string, unknown>>;

      if (!existing.length) {
        throw new NotFoundException({ code: 'SESSION_NOT_FOUND', message: `ScreeningSession ${id} not found.` });
      }

      const session = this.mapRow(existing[0]);
      if (session.status === 'COMPLETED') {
        throw new BadRequestException({ code: 'SESSION_ALREADY_COMPLETED', message: 'Session is already completed.' });
      }

      const updated = (await em.query(
        `UPDATE screening_session SET
           status = 'COMPLETED',
           session_end_utc = $2,
           input_tonnage_kg = $3,
           calibre_yields = $4::jsonb,
           notes_md = COALESCE($5, notes_md),
           updated_at_utc = now()
         WHERE id = $1
         RETURNING *`,
        [
          id,
          completedAt,
          dto.inputTonnageKg,
          JSON.stringify(dto.calibreYields),
          dto.notesMd ?? null,
        ],
      )) as Array<Record<string, unknown>>;

      const completed = this.mapRow(updated[0]);

      // Publish ONE outbox event with full calibre_yields array.
      // The handler will iterate and emit one STOCKPILE_INFLOW per calibre.
      await this.outboxService.publish({
        tenantId: completed.tenantId,
        aggregateType: 'screening_session',
        aggregateId: completed.id,
        eventType: 'production.screening.session_completed',
        payload: {
          session_id: completed.id,
          tenant_id: completed.tenantId,
          site_id: completed.siteId,
          operational_day_id: completed.operationalDayId,
          screen_id: completed.screenId,
          input_tonnage_kg: completed.inputTonnageKg,
          calibre_yields: completed.calibreYields,
          operator_id: dto.operatorId,
          completed_at_utc: completedAt.toISOString(),
        },
        manager: em,
      });

      return completed;
    };

    if (manager) return run(manager);
    return this.ds.transaction(run);
  }

  async findById(id: string, tenantId: string): Promise<ScreeningSession | null> {
    const rows = (await this.ds.query(
      `SELECT * FROM screening_session WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    )) as Array<Record<string, unknown>>;
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  async list(
    tenantId: string,
    filters: { siteId?: string; operationalDayId?: string; status?: ScreeningSessionStatus },
  ): Promise<ScreeningSession[]> {
    const conditions: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let idx = 2;

    if (filters.siteId) {
      conditions.push(`site_id = $${idx++}`);
      params.push(filters.siteId);
    }
    if (filters.operationalDayId) {
      conditions.push(`operational_day_id = $${idx++}`);
      params.push(filters.operationalDayId);
    }
    if (filters.status) {
      conditions.push(`status = $${idx++}::crusher_session_status`);
      params.push(filters.status);
    }

    const rows = (await this.ds.query(
      `SELECT * FROM screening_session WHERE ${conditions.join(' AND ')} ORDER BY session_start_utc DESC`,
      params,
    )) as Array<Record<string, unknown>>;

    return rows.map((r) => this.mapRow(r));
  }

  /**
   * Validates calibre_yields:
   * - At least 1 entry required for completion
   * - Each is_nonconforming=true entry must have nonconformity_reason
   */
  validateCalibreYields(yields: CalibreYield[]): void {
    if (!yields || yields.length === 0) {
      throw new BadRequestException({
        code: 'CALIBRE_YIELDS_REQUIRED',
        message: 'At least one calibre_yield entry is required for completion.',
      });
    }

    for (const y of yields) {
      if (y.is_nonconforming && !y.nonconformity_reason) {
        throw new BadRequestException({
          code: 'NONCONFORMITY_REASON_REQUIRED',
          message: `calibre_code ${y.calibre_code}: nonconformity_reason is required when is_nonconforming=true.`,
        });
      }
      if (y.tonnage_kg < 0) {
        throw new BadRequestException({
          code: 'INVALID_TONNAGE',
          message: `calibre_code ${y.calibre_code}: tonnage_kg must be non-negative.`,
        });
      }
    }
  }

  private async transitionStatus(
    id: string,
    fromStatus: ScreeningSessionStatus,
    toStatus: ScreeningSessionStatus,
  ): Promise<ScreeningSession> {
    const rows = (await this.ds.query(
      `UPDATE screening_session
         SET status = $3::crusher_session_status, updated_at_utc = now()
       WHERE id = $1 AND status = $2::crusher_session_status
       RETURNING *`,
      [id, fromStatus, toStatus],
    )) as Array<Record<string, unknown>>;

    if (!rows.length) {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot transition from ${fromStatus} to ${toStatus} for session ${id}.`,
      });
    }

    return this.mapRow(rows[0]);
  }

  private mapRow(r: Record<string, unknown>): ScreeningSession {
    return {
      id: r['id'] as string,
      tenantId: r['tenant_id'] as string,
      siteId: r['site_id'] as string,
      operationalDayId: r['operational_day_id'] as string,
      screenId: r['screen_id'] as string,
      inputStockpileId: (r['input_stockpile_id'] as string | null) ?? null,
      sessionStartUtc: new Date(r['session_start_utc'] as string | Date),
      sessionEndUtc: r['session_end_utc'] ? new Date(r['session_end_utc'] as string | Date) : null,
      inputTonnageKg: Number(r['input_tonnage_kg']),
      calibreYields: (r['calibre_yields'] as CalibreYield[]) ?? [],
      operatorId: r['operator_id'] as string,
      status: r['status'] as ScreeningSessionStatus,
      notesMd: (r['notes_md'] as string | null) ?? null,
      createdAtUtc: new Date(r['created_at_utc'] as string | Date),
      updatedAtUtc: new Date(r['updated_at_utc'] as string | Date),
    };
  }
}
