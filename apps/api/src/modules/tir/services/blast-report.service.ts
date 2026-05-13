import { createHash, randomUUID } from 'crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BlastReport } from '../entities/blast-report.entity';
import { BlastPlanService } from './blast-plan.service';

/** 32 zero bytes — chain genesis sentinel for blast_report. */
export const BLAST_REPORT_GENESIS_HASH: Buffer = Buffer.alloc(32, 0);

/**
 * Canonical payload for blast_report chain-of-hash.
 * Field order FROZEN per ADR-0012. Must match CANONICAL_PAYLOAD_SQL.blast_report.
 */
export function buildBlastReportCanonicalPayload(args: {
  blastPlanId: string;
  fragmentationObs: string;
  vibrationMmS: string | null;
  incidentIds: string[];
  occurredAtUtc: Date;
}): Buffer {
  const obj = {
    blast_plan_id: args.blastPlanId,
    fragmentation_obs: args.fragmentationObs,
    vibration_mm_s: args.vibrationMmS,
    incident_ids: args.incidentIds,
    occurred_at_utc: args.occurredAtUtc.toISOString(),
  };
  return Buffer.from(JSON.stringify(obj), 'utf8');
}

export function sha256BlastReport(prev: Buffer, payload: Buffer): Buffer {
  return createHash('sha256').update(Buffer.concat([prev, payload])).digest();
}

export interface AppendBlastReportInput {
  tenantId: string;
  siteId: string;
  blastPlanId: string;
  fragmentationObs: string;
  vibrationMmS?: number | null;
  incidentIds?: string[];
  reporterId: string;
  notesMd?: string | null;
  occurredAtUtc?: Date;
}

/**
 * BlastReportService — TIR-06.
 *
 * Appends an immutable blast report (chain-of-hash) after a plan is FIRED.
 * Transitions blast_plan.status → REPORTED.
 */
@Injectable()
export class BlastReportService {
  private readonly logger = new Logger(BlastReportService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly blastPlanService: BlastPlanService,
  ) {}

  async append(input: AppendBlastReportInput): Promise<BlastReport> {
    // Verify blast plan is FIRED
    const plan = await this.blastPlanService.findById(input.blastPlanId, input.tenantId);
    if (plan.status !== 'FIRED') {
      throw new UnprocessableEntityException({
        code: 'ERR_PLAN_NOT_FIRED',
        message: `Cannot submit blast report: plan ${input.blastPlanId} is in status=${plan.status}; expected FIRED.`,
      });
    }

    const incidentIds = input.incidentIds ?? [];

    // Validate incident UUIDs if provided
    if (incidentIds.length > 0) {
      await this.validateIncidentIds(incidentIds, input.tenantId);
    }

    const occurredAtUtc = input.occurredAtUtc ?? new Date();

    const result = await this.ds.transaction(async (em) => {
      // Fetch prev hash for chain
      const prevRows = (await em.query(
        `SELECT row_hash
           FROM blast_report
          WHERE tenant_id = $1 AND site_id = $2
          ORDER BY occurred_at_utc DESC, id DESC
          LIMIT 1`,
        [input.tenantId, input.siteId],
      )) as Array<{ row_hash: Buffer }>;

      const prevHash =
        prevRows.length === 0
          ? BLAST_REPORT_GENESIS_HASH
          : Buffer.from(prevRows[0].row_hash);

      const payload = buildBlastReportCanonicalPayload({
        blastPlanId: input.blastPlanId,
        fragmentationObs: input.fragmentationObs,
        vibrationMmS: input.vibrationMmS != null ? input.vibrationMmS.toString() : null,
        incidentIds,
        occurredAtUtc,
      });
      const rowHash = sha256BlastReport(prevHash, payload);
      const id = randomUUID();

      const rows = (await em.query(
        `INSERT INTO blast_report (
           id, occurred_at_utc, tenant_id, site_id, blast_plan_id,
           fragmentation_obs, vibration_mm_s, incident_ids, reporter_id,
           notes_md, prev_hash, row_hash
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8::uuid[], $9,
           $10, $11, $12
         )
         RETURNING id, occurred_at_utc, tenant_id, site_id, blast_plan_id,
                   fragmentation_obs, vibration_mm_s, incident_ids, reporter_id,
                   notes_md, prev_hash, row_hash, created_at_utc`,
        [
          id,
          occurredAtUtc,
          input.tenantId,
          input.siteId,
          input.blastPlanId,
          input.fragmentationObs,
          input.vibrationMmS ?? null,
          `{${incidentIds.join(',')}}`,
          input.reporterId,
          input.notesMd ?? null,
          prevHash,
          rowHash,
        ],
      )) as Array<Record<string, unknown>>;

      // Transition blast_plan → REPORTED inside the same transaction
      await em.query(
        `UPDATE blast_plan SET status = 'REPORTED' WHERE id = $1 AND tenant_id = $2`,
        [input.blastPlanId, input.tenantId],
      );

      return this.mapRow(rows[0]);
    });

    this.logger.log(
      `[BlastReport] Appended report for plan ${input.blastPlanId} — plan now REPORTED`,
    );
    return result;
  }

  private async validateIncidentIds(
    incidentIds: string[],
    tenantId: string,
  ): Promise<void> {
    // Check each incident UUID exists in hse_incident table.
    // Cross-module reference — no FK, service-layer validation per ADR-0012.
    const rows = (await this.ds.query(
      `SELECT id FROM hse_incident WHERE id = ANY($1::uuid[]) AND tenant_id = $2`,
      [`{${incidentIds.join(',')}}`, tenantId],
    )) as Array<{ id: string }>;

    const foundIds = new Set(rows.map((r) => r.id));
    const missing = incidentIds.find((id) => !foundIds.has(id));
    if (missing) {
      throw new BadRequestException({
        code: 'ERR_INCIDENT_NOT_FOUND',
        message: `HSE incident ${missing} not found for tenant ${tenantId}.`,
      });
    }
  }

  private mapRow(r: Record<string, unknown>): BlastReport {
    const incidentRaw = r['incident_ids'];
    let incidentIds: string[] = [];
    if (Array.isArray(incidentRaw)) {
      incidentIds = incidentRaw as string[];
    } else if (typeof incidentRaw === 'string') {
      incidentIds = incidentRaw
        .replace(/^\{|\}$/g, '')
        .split(',')
        .filter(Boolean);
    }

    return {
      id: r['id'] as string,
      occurredAtUtc: new Date(r['occurred_at_utc'] as string | Date),
      tenantId: r['tenant_id'] as string,
      siteId: r['site_id'] as string,
      blastPlanId: r['blast_plan_id'] as string,
      fragmentationObs: r['fragmentation_obs'] as string,
      vibrationMmS: r['vibration_mm_s'] != null ? String(r['vibration_mm_s']) : null,
      incidentIds,
      reporterId: r['reporter_id'] as string,
      notesMd: (r['notes_md'] as string | null) ?? null,
      prevHash: Buffer.from(r['prev_hash'] as Buffer),
      rowHash: Buffer.from(r['row_hash'] as Buffer),
      createdAtUtc: new Date(r['created_at_utc'] as string | Date),
    };
  }
}
