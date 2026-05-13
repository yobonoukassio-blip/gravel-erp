import { randomUUID } from 'crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { OutboxService } from '../../outbox/outbox.service';
import { EnergyConsumptionService } from '../../fuel/services/energy-consumption.service';
import { CrusherSession, CrusherSessionStatus } from '../entities/crusher-session.entity';

export interface OpenCrusherSessionDto {
  tenantId: string;
  siteId: string;
  operationalDayId: string;
  crusherId: string;
  inputZoneId?: string | null;
  outputStockpileId: string;
  materialType: string;
  calibreCode: string;
  operatorId: string;
  sessionStartUtc?: Date;
  notesMd?: string | null;
}

export interface CompleteCrusherSessionDto {
  inputTonnageKg: number;
  outputTonnageKg: number;
  energyKwh: number;
  operatingHours: number;
  notesMd?: string | null;
  /** yearMonth for EnergyConsumptionService upsert (e.g. "2026-05") */
  yearMonth: string;
  operatorId: string;
}

@Injectable()
export class CrusherSessionService {
  private readonly logger = new Logger(CrusherSessionService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly outboxService: OutboxService,
    private readonly energyService: EnergyConsumptionService,
  ) {}

  async open(dto: OpenCrusherSessionDto): Promise<CrusherSession> {
    const id = randomUUID();
    const now = dto.sessionStartUtc ?? new Date();

    const rows = (await this.ds.query(
      `INSERT INTO crusher_session (
         id, tenant_id, site_id, operational_day_id, crusher_id,
         input_zone_id, output_stockpile_id, material_type, calibre_code,
         operator_id, session_start_utc, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'ACTIVE')
       RETURNING *`,
      [
        id,
        dto.tenantId,
        dto.siteId,
        dto.operationalDayId,
        dto.crusherId,
        dto.inputZoneId ?? null,
        dto.outputStockpileId,
        dto.materialType,
        dto.calibreCode,
        dto.operatorId,
        now,
      ],
    )) as Array<Record<string, unknown>>;

    return this.mapRow(rows[0]);
  }

  async pause(id: string): Promise<CrusherSession> {
    return this.transitionStatus(id, 'ACTIVE', 'PAUSED');
  }

  async resume(id: string): Promise<CrusherSession> {
    return this.transitionStatus(id, 'PAUSED', 'ACTIVE');
  }

  /**
   * Completes the crusher session atomically:
   *  1. Updates session fields (status = COMPLETED) inside the same tx
   *  2. Publishes outbox event `production.crusher.session_completed` in same tx
   *  3. After tx commits: calls energyService.upsert() to record kwh reading
   *
   * The outbox event and session update share the same EntityManager transaction.
   * Rollback test: roll back the outer tx → both the session update and outbox row disappear.
   */
  async complete(
    id: string,
    dto: CompleteCrusherSessionDto,
    manager?: EntityManager,
  ): Promise<CrusherSession> {
    if (dto.inputTonnageKg < 0 || dto.outputTonnageKg < 0) {
      throw new BadRequestException({ code: 'INVALID_TONNAGE', message: 'Tonnage values must be non-negative.' });
    }
    if (dto.energyKwh < 0) {
      throw new BadRequestException({ code: 'INVALID_ENERGY', message: 'energy_kwh must be non-negative.' });
    }

    const completedAt = new Date();

    const run = async (em: EntityManager): Promise<CrusherSession> => {
      // Lock and verify session is not already completed.
      const existing = await em.query(
        `SELECT * FROM crusher_session WHERE id = $1 FOR UPDATE`,
        [id],
      ) as Array<Record<string, unknown>>;

      if (!existing.length) {
        throw new NotFoundException({ code: 'SESSION_NOT_FOUND', message: `CrusherSession ${id} not found.` });
      }

      const session = this.mapRow(existing[0]);
      if (session.status === 'COMPLETED') {
        throw new BadRequestException({ code: 'SESSION_ALREADY_COMPLETED', message: 'Session is already completed.' });
      }

      const updated = (await em.query(
        `UPDATE crusher_session SET
           status = 'COMPLETED',
           session_end_utc = $2,
           input_tonnage_kg = $3,
           output_tonnage_kg = $4,
           energy_kwh = $5,
           operating_hours = $6,
           notes_md = COALESCE($7, notes_md),
           updated_at_utc = now()
         WHERE id = $1
         RETURNING *`,
        [
          id,
          completedAt,
          dto.inputTonnageKg,
          dto.outputTonnageKg,
          dto.energyKwh,
          dto.operatingHours,
          dto.notesMd ?? null,
        ],
      )) as Array<Record<string, unknown>>;

      const completed = this.mapRow(updated[0]);

      // Publish outbox event in SAME transaction — atomicity guaranteed.
      await this.outboxService.publish({
        tenantId: completed.tenantId,
        aggregateType: 'crusher_session',
        aggregateId: completed.id,
        eventType: 'production.crusher.session_completed',
        payload: {
          session_id: completed.id,
          tenant_id: completed.tenantId,
          site_id: completed.siteId,
          operational_day_id: completed.operationalDayId,
          crusher_id: completed.crusherId,
          output_stockpile_id: completed.outputStockpileId,
          output_tonnage_kg: completed.outputTonnageKg,
          input_tonnage_kg: completed.inputTonnageKg,
          material_type: completed.materialType,
          calibre_code: completed.calibreCode,
          energy_kwh: completed.energyKwh,
          operator_id: dto.operatorId,
          completed_at_utc: completedAt.toISOString(),
        },
        manager: em,
      });

      return completed;
    };

    let completed: CrusherSession;
    if (manager) {
      completed = await run(manager);
    } else {
      completed = await this.ds.transaction(run);
    }

    // Post-commit: record energy reading (outside the tx to avoid tx failure on notification side-effect).
    // If this fails, the session is still completed and the outbox event is published.
    try {
      await this.energyService.upsert({
        tenantId: completed.tenantId,
        siteId: completed.siteId,
        yearMonth: dto.yearMonth,
        usageType: 'concassage',
        kwh: completed.energyKwh,
        sourceMeterCode: `crusher_session:${completed.id}`,
        recordedBy: dto.operatorId,
        notes: `Auto-recorded from crusher session ${completed.id}`,
      });
    } catch (err) {
      this.logger.error(
        `EnergyConsumptionService.upsert failed for crusher session ${completed.id}: ${(err as Error).message}`,
      );
      // Non-blocking — session is already completed.
    }

    return completed;
  }

  async findById(id: string, tenantId: string): Promise<CrusherSession | null> {
    const rows = (await this.ds.query(
      `SELECT * FROM crusher_session WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    )) as Array<Record<string, unknown>>;
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  async list(
    tenantId: string,
    filters: { siteId?: string; operationalDayId?: string; status?: CrusherSessionStatus },
  ): Promise<CrusherSession[]> {
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
      `SELECT * FROM crusher_session WHERE ${conditions.join(' AND ')} ORDER BY session_start_utc DESC`,
      params,
    )) as Array<Record<string, unknown>>;

    return rows.map((r) => this.mapRow(r));
  }

  private async transitionStatus(
    id: string,
    fromStatus: CrusherSessionStatus,
    toStatus: CrusherSessionStatus,
  ): Promise<CrusherSession> {
    const rows = (await this.ds.query(
      `UPDATE crusher_session
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

  private mapRow(r: Record<string, unknown>): CrusherSession {
    return {
      id: r['id'] as string,
      tenantId: r['tenant_id'] as string,
      siteId: r['site_id'] as string,
      operationalDayId: r['operational_day_id'] as string,
      crusherId: r['crusher_id'] as string,
      inputZoneId: (r['input_zone_id'] as string | null) ?? null,
      outputStockpileId: r['output_stockpile_id'] as string,
      materialType: r['material_type'] as string,
      calibreCode: r['calibre_code'] as string,
      inputTonnageKg: Number(r['input_tonnage_kg']),
      outputTonnageKg: Number(r['output_tonnage_kg']),
      energyKwh: Number(r['energy_kwh']),
      operatingHours: Number(r['operating_hours']),
      performancePct: Number(r['performance_pct']),
      sessionStartUtc: new Date(r['session_start_utc'] as string | Date),
      sessionEndUtc: r['session_end_utc'] ? new Date(r['session_end_utc'] as string | Date) : null,
      operatorId: r['operator_id'] as string,
      status: r['status'] as CrusherSessionStatus,
      notesMd: (r['notes_md'] as string | null) ?? null,
      createdAtUtc: new Date(r['created_at_utc'] as string | Date),
      updatedAtUtc: new Date(r['updated_at_utc'] as string | Date),
    };
  }
}
