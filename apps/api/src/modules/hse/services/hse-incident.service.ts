import { createHash, randomUUID } from 'crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import {
  HseCategory,
  HseIncident,
  HseIncidentStatus,
  PersonImpacted,
} from '../entities/hse-incident.entity';

export const GENESIS_PREV_HASH: Buffer = Buffer.alloc(32, 0);

export interface CreateHseIncidentInput {
  tenantId: string;
  siteId: string;
  occurredAtLocal: Date;
  ianaTimezone: string;
  occurredAtUtc: Date;
  operationalDayId: string;
  category: HseCategory;
  severity: number;
  reporterUserId: string;
  locationText: string;
  gpsPoint?: string | null;
  peopleImpacted: PersonImpacted[];
  equipmentImpactedIds: string[];
  chronologyMd: string;
  contentAddressedAttachments?: string[];
  manager?: EntityManager;
}

/**
 * Canonical payload for chain-of-hash.
 * Must match CANONICAL_PAYLOAD_SQL.hse_incident in event-chain.verifier.ts.
 */
export function buildHseIncidentCanonicalPayload(args: {
  category: HseCategory;
  severity: number;
  occurredAtLocal: Date;
  ianaTimezone: string;
  operationalDayId: string;
  locationText: string;
  peopleImpacted: PersonImpacted[];
  equipmentImpactedIds: string[];
  chronologyMd: string;
  contentAddressedAttachments: string[];
}): Buffer {
  const obj = {
    category: args.category,
    severity: args.severity,
    occurred_at_local: args.occurredAtLocal.toISOString(),
    iana_timezone: args.ianaTimezone,
    operational_day_id: args.operationalDayId,
    location_text: args.locationText,
    people_impacted: args.peopleImpacted,
    equipment_impacted_ids: args.equipmentImpactedIds,
    chronology_md: args.chronologyMd,
    content_addressed_attachments: args.contentAddressedAttachments,
  };
  return Buffer.from(JSON.stringify(obj), 'utf8');
}

export function sha256(prev: Buffer, payload: Buffer): Buffer {
  return createHash('sha256').update(Buffer.concat([prev, payload])).digest();
}

@Injectable()
export class HseIncidentService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Create a new HSE incident — append-only.
   * Computes chain-of-hash inline.
   */
  async create(input: CreateHseIncidentInput): Promise<HseIncident> {
    this.assertInvariants(input);

    const run = async (em: EntityManager): Promise<HseIncident> => {
      const prev = await this.fetchPrevHash(em, input.tenantId);
      const attachments = input.contentAddressedAttachments ?? [];
      const equipmentIds = input.equipmentImpactedIds ?? [];

      const payload = buildHseIncidentCanonicalPayload({
        category: input.category,
        severity: input.severity,
        occurredAtLocal: input.occurredAtLocal,
        ianaTimezone: input.ianaTimezone,
        operationalDayId: input.operationalDayId,
        locationText: input.locationText,
        peopleImpacted: input.peopleImpacted,
        equipmentImpactedIds: equipmentIds,
        chronologyMd: input.chronologyMd,
        contentAddressedAttachments: attachments,
      });
      const rowHash = sha256(prev, payload);
      const id = randomUUID();

      const rows = (await em.query(
        `INSERT INTO hse_incident (
           id, tenant_id, site_id, occurred_at_local, iana_timezone, occurred_at_utc,
           operational_day_id, category, severity, reporter_user_id, location_text,
           gps_point, people_impacted, equipment_impacted_ids, chronology_md,
           content_addressed_attachments, status, prev_hash, row_hash
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           $7, $8::hse_category, $9, $10, $11,
           $12, $13::jsonb, $14::text[], $15,
           $16::text[], $17, $18, $19
         )
         RETURNING id, tenant_id, site_id, occurred_at_local, iana_timezone, occurred_at_utc,
                   operational_day_id, category, severity, reporter_user_id, location_text,
                   gps_point, people_impacted, equipment_impacted_ids, chronology_md,
                   content_addressed_attachments, status, prev_hash, row_hash, created_at_utc`,
        [
          id,
          input.tenantId,
          input.siteId,
          input.occurredAtLocal,
          input.ianaTimezone,
          input.occurredAtUtc,
          input.operationalDayId,
          input.category,
          input.severity,
          input.reporterUserId,
          input.locationText,
          input.gpsPoint ?? null,
          JSON.stringify(input.peopleImpacted),
          equipmentIds.length > 0 ? `{${equipmentIds.map((id) => `"${id}"`).join(',')}}` : '{}',
          input.chronologyMd,
          attachments.length > 0
            ? `{${attachments.map((h) => `"${h}"`).join(',')}}`
            : '{}',
          'open',
          prev,
          rowHash,
        ],
      )) as Array<Record<string, unknown>>;

      const saved = this.mapRow(rows[0]);

      this.events.emit('hse.incident.created', {
        incident_id: saved.id,
        severity: saved.severity,
        category: saved.category,
        site_id: saved.siteId,
        tenant_id: saved.tenantId,
      });

      return saved;
    };

    if (input.manager) return run(input.manager);
    return this.ds.transaction(run);
  }

  /**
   * Close an incident.
   * Severity >= 4: requires all CAPAs to be 'verified' first.
   */
  async close(incidentId: string, tenantId: string, _userId: string): Promise<HseIncident> {
    return this.ds.transaction(async (em) => {
      const rows = (await em.query(
        `SELECT id, tenant_id, site_id, occurred_at_local, iana_timezone, occurred_at_utc,
                operational_day_id, category, severity, reporter_user_id, location_text,
                gps_point, people_impacted, equipment_impacted_ids, chronology_md,
                content_addressed_attachments, status, prev_hash, row_hash, created_at_utc
           FROM hse_incident
          WHERE id = $1 AND tenant_id = $2`,
        [incidentId, tenantId],
      )) as Array<Record<string, unknown>>;

      if (rows.length === 0) {
        throw new NotFoundException({ code: 'HSE_INCIDENT_NOT_FOUND' });
      }

      const incident = this.mapRow(rows[0]);

      if (incident.severity >= 4) {
        const capaCheck = (await em.query(
          `SELECT COUNT(*) AS cnt
             FROM corrective_action
            WHERE incident_id = $1 AND tenant_id = $2 AND status != 'verified'`,
          [incidentId, tenantId],
        )) as Array<{ cnt: string }>;

        const unverified = parseInt(capaCheck[0].cnt, 10);
        if (unverified > 0) {
          throw new BadRequestException({
            code: 'ERR_CAPA_NOT_VERIFIED',
            message: `Incident severity ${incident.severity} cannot be closed: ${unverified} CAPA(s) not yet verified.`,
          });
        }
      }

      await em.query(
        `UPDATE hse_incident SET status = 'closed' WHERE id = $1 AND tenant_id = $2`,
        [incidentId, tenantId],
      );

      return { ...incident, status: 'closed' };
    });
  }

  /** Reject any mutation attempt with 405. */
  rejectPatch(): never {
    throw new HttpException(
      { code: 'METHOD_NOT_ALLOWED', message: 'hse_incident is append-only.' },
      HttpStatus.METHOD_NOT_ALLOWED,
    );
  }

  async findById(id: string, tenantId: string): Promise<HseIncident> {
    const rows = (await this.ds.query(
      `SELECT id, tenant_id, site_id, occurred_at_local, iana_timezone, occurred_at_utc,
              operational_day_id, category, severity, reporter_user_id, location_text,
              gps_point, people_impacted, equipment_impacted_ids, chronology_md,
              content_addressed_attachments, status, prev_hash, row_hash, created_at_utc
         FROM hse_incident
        WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    )) as Array<Record<string, unknown>>;

    if (rows.length === 0) throw new NotFoundException({ code: 'HSE_INCIDENT_NOT_FOUND' });
    return this.mapRow(rows[0]);
  }

  async list(
    tenantId: string,
    siteId?: string,
  ): Promise<HseIncident[]> {
    const params: unknown[] = [tenantId];
    let siteClause = '';
    if (siteId) {
      params.push(siteId);
      siteClause = ` AND site_id = $${params.length}`;
    }

    const rows = (await this.ds.query(
      `SELECT id, tenant_id, site_id, occurred_at_local, iana_timezone, occurred_at_utc,
              operational_day_id, category, severity, reporter_user_id, location_text,
              gps_point, people_impacted, equipment_impacted_ids, chronology_md,
              content_addressed_attachments, status, prev_hash, row_hash, created_at_utc
         FROM hse_incident
        WHERE tenant_id = $1${siteClause}
        ORDER BY occurred_at_utc DESC`,
      params,
    )) as Array<Record<string, unknown>>;

    return rows.map((r) => this.mapRow(r));
  }

  private async fetchPrevHash(em: EntityManager, tenantId: string): Promise<Buffer> {
    const rows = (await em.query(
      `SELECT row_hash
         FROM hse_incident
        WHERE tenant_id = $1
        ORDER BY occurred_at_utc DESC, id DESC
        LIMIT 1`,
      [tenantId],
    )) as Array<{ row_hash: Buffer }>;
    if (rows.length === 0) return GENESIS_PREV_HASH;
    return Buffer.from(rows[0].row_hash);
  }

  private assertInvariants(input: CreateHseIncidentInput): void {
    if (input.severity < 1 || input.severity > 5) {
      throw new BadRequestException({
        code: 'INVALID_SEVERITY',
        message: 'severity must be between 1 and 5.',
      });
    }
    if (!input.chronologyMd || input.chronologyMd.trim().length === 0) {
      throw new BadRequestException({
        code: 'CHRONOLOGY_REQUIRED',
        message: 'chronology_md is required.',
      });
    }
  }

  private mapRow(r: Record<string, unknown>): HseIncident {
    return {
      id: r['id'] as string,
      tenantId: r['tenant_id'] as string,
      siteId: r['site_id'] as string,
      occurredAtLocal: new Date(r['occurred_at_local'] as string | Date),
      ianaTimezone: r['iana_timezone'] as string,
      occurredAtUtc: new Date(r['occurred_at_utc'] as string | Date),
      operationalDayId: r['operational_day_id'] as string,
      category: r['category'] as HseCategory,
      severity: Number(r['severity']),
      reporterUserId: r['reporter_user_id'] as string,
      locationText: r['location_text'] as string,
      gpsPoint: (r['gps_point'] as string | null) ?? null,
      peopleImpacted: (r['people_impacted'] as PersonImpacted[] | null) ?? [],
      equipmentImpactedIds: this.parseArray(r['equipment_impacted_ids']),
      chronologyMd: r['chronology_md'] as string,
      contentAddressedAttachments: this.parseArray(r['content_addressed_attachments']),
      status: r['status'] as HseIncidentStatus,
      prevHash: Buffer.from(r['prev_hash'] as Buffer),
      rowHash: Buffer.from(r['row_hash'] as Buffer),
      createdAtUtc: new Date(r['created_at_utc'] as string | Date),
    };
  }

  private parseArray(val: unknown): string[] {
    if (!val) return [];
    if (Array.isArray(val)) return val as string[];
    if (typeof val === 'string') {
      // Postgres text[] comes back as '{a,b,c}' or '{}' string sometimes
      const trimmed = val.replace(/^\{|\}$/g, '');
      if (!trimmed) return [];
      return trimmed.split(',').map((s) => s.replace(/^"|"$/g, '').trim());
    }
    return [];
  }
}
