import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  CapaPriority,
  CapaStatus,
  CorrectiveAction,
} from '../entities/corrective-action.entity';

export interface CreateCorrectiveActionInput {
  tenantId: string;
  incidentId: string;
  description: string;
  assignedToUserId: string;
  dueDateLocal: string;
  ianaTimezone: string;
  priority: CapaPriority;
  createdBy: string;
  actorRole: string;
}

export interface TransitionInput {
  tenantId: string;
  capaId: string;
  newStatus: CapaStatus;
  userId: string;
  actorRole: string;
  closedEvidenceAttachments?: string[];
}

/**
 * Valid status transitions for CAPA workflow (D2-62).
 *
 * open → in_progress → done → verified → closed
 * Any backward transition is rejected.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<CapaStatus, CapaStatus[]>> = Object.freeze({
  open: ['in_progress'],
  in_progress: ['done'],
  done: ['verified'],
  verified: ['closed'],
  closed: [],
});

/**
 * Roles permitted to assign / create a CAPA (D2-62).
 * HSE_OFFICER or SITE_MANAGER.
 */
const ASSIGNMENT_ROLES = new Set(['HSE_OFFICER', 'SITE_MANAGER']);

/**
 * CorrectiveActionService — manages CAPA lifecycle (HSE-02).
 *
 * - Status transitions enforced with ALLOWED_TRANSITIONS
 * - Verification step (done → verified) must be performed by a different user
 *   than the one who closed (closed_by vs verification_user_id)
 * - HseIncidentService.close() delegates the severity≥4 guard check here
 */
@Injectable()
export class CorrectiveActionService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async create(input: CreateCorrectiveActionInput): Promise<CorrectiveAction> {
    if (!ASSIGNMENT_ROLES.has(input.actorRole)) {
      throw new ForbiddenException({
        code: 'CAPA_ROLE_REQUIRED',
        message: 'Creating a CAPA requires HSE_OFFICER or SITE_MANAGER role.',
      });
    }

    if (!input.description || input.description.trim().length === 0) {
      throw new BadRequestException({
        code: 'CAPA_DESCRIPTION_REQUIRED',
        message: 'CAPA description is required.',
      });
    }

    const rows = (await this.ds.query(
      `INSERT INTO corrective_action (
         id, tenant_id, incident_id, description, assigned_to_user_id,
         due_date_local, iana_timezone, priority, status, closed_evidence_attachments,
         created_by
       ) VALUES (
         uuid_generate_v4(), $1, $2, $3, $4,
         $5, $6, $7::capa_priority, 'open', '{}',
         $8
       )
       RETURNING id, tenant_id, incident_id, description, assigned_to_user_id,
                 due_date_local, iana_timezone, priority, status, closed_evidence_attachments,
                 closed_at_utc, closed_by, verification_user_id, verified_at_utc,
                 created_by, created_at_utc, updated_at_utc`,
      [
        input.tenantId,
        input.incidentId,
        input.description,
        input.assignedToUserId,
        input.dueDateLocal,
        input.ianaTimezone,
        input.priority,
        input.createdBy,
      ],
    )) as Array<Record<string, unknown>>;

    return this.mapRow(rows[0]);
  }

  async transition(input: TransitionInput): Promise<CorrectiveAction> {
    return this.ds.transaction(async (em) => {
      const rows = (await em.query(
        `SELECT id, tenant_id, incident_id, description, assigned_to_user_id,
                due_date_local, iana_timezone, priority, status, closed_evidence_attachments,
                closed_at_utc, closed_by, verification_user_id, verified_at_utc,
                created_by, created_at_utc, updated_at_utc
           FROM corrective_action
          WHERE id = $1 AND tenant_id = $2`,
        [input.capaId, input.tenantId],
      )) as Array<Record<string, unknown>>;

      if (rows.length === 0) {
        throw new NotFoundException({ code: 'CAPA_NOT_FOUND' });
      }

      const capa = this.mapRow(rows[0]);
      const allowed = ALLOWED_TRANSITIONS[capa.status];
      if (!allowed.includes(input.newStatus)) {
        throw new BadRequestException({
          code: 'CAPA_INVALID_TRANSITION',
          message: `Cannot transition CAPA from '${capa.status}' to '${input.newStatus}'.`,
        });
      }

      // Verification step: user who verifies must differ from user who submitted done.
      if (input.newStatus === 'verified' && capa.closedBy === input.userId) {
        throw new ForbiddenException({
          code: 'CAPA_SELF_VERIFY_FORBIDDEN',
          message: 'The user who submitted done cannot verify the same CAPA.',
        });
      }

      const now = new Date();
      const updates: string[] = ['status = $3', 'updated_at_utc = now()'];
      const params: unknown[] = [input.capaId, input.tenantId, input.newStatus];

      if (input.newStatus === 'done') {
        updates.push(`closed_by = $${params.length + 1}`);
        params.push(input.userId);
        updates.push(`closed_at_utc = $${params.length + 1}`);
        params.push(now);
      }
      if (input.newStatus === 'verified') {
        updates.push(`verification_user_id = $${params.length + 1}`);
        params.push(input.userId);
        updates.push(`verified_at_utc = $${params.length + 1}`);
        params.push(now);
      }
      if (input.newStatus === 'closed' && input.closedEvidenceAttachments?.length) {
        updates.push(`closed_evidence_attachments = $${params.length + 1}::text[]`);
        params.push(
          `{${input.closedEvidenceAttachments.map((h) => `"${h}"`).join(',')}}`,
        );
      }

      const updated = (await em.query(
        `UPDATE corrective_action
            SET ${updates.join(', ')}
          WHERE id = $1 AND tenant_id = $2
          RETURNING id, tenant_id, incident_id, description, assigned_to_user_id,
                    due_date_local, iana_timezone, priority, status, closed_evidence_attachments,
                    closed_at_utc, closed_by, verification_user_id, verified_at_utc,
                    created_by, created_at_utc, updated_at_utc`,
        params,
      )) as Array<Record<string, unknown>>;

      return this.mapRow(updated[0]);
    });
  }

  async listForIncident(incidentId: string, tenantId: string): Promise<CorrectiveAction[]> {
    const rows = (await this.ds.query(
      `SELECT id, tenant_id, incident_id, description, assigned_to_user_id,
              due_date_local, iana_timezone, priority, status, closed_evidence_attachments,
              closed_at_utc, closed_by, verification_user_id, verified_at_utc,
              created_by, created_at_utc, updated_at_utc
         FROM corrective_action
        WHERE incident_id = $1 AND tenant_id = $2
        ORDER BY created_at_utc ASC`,
      [incidentId, tenantId],
    )) as Array<Record<string, unknown>>;

    return rows.map((r) => this.mapRow(r));
  }

  async findById(id: string, tenantId: string): Promise<CorrectiveAction> {
    const rows = (await this.ds.query(
      `SELECT id, tenant_id, incident_id, description, assigned_to_user_id,
              due_date_local, iana_timezone, priority, status, closed_evidence_attachments,
              closed_at_utc, closed_by, verification_user_id, verified_at_utc,
              created_by, created_at_utc, updated_at_utc
         FROM corrective_action
        WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    )) as Array<Record<string, unknown>>;

    if (rows.length === 0) throw new NotFoundException({ code: 'CAPA_NOT_FOUND' });
    return this.mapRow(rows[0]);
  }

  private mapRow(r: Record<string, unknown>): CorrectiveAction {
    return {
      id: r['id'] as string,
      tenantId: r['tenant_id'] as string,
      incidentId: r['incident_id'] as string,
      description: r['description'] as string,
      assignedToUserId: r['assigned_to_user_id'] as string,
      dueDateLocal: r['due_date_local'] as string,
      ianaTimezone: r['iana_timezone'] as string,
      priority: r['priority'] as CapaPriority,
      status: r['status'] as CapaStatus,
      closedEvidenceAttachments: this.parseArray(r['closed_evidence_attachments']),
      closedAtUtc: r['closed_at_utc'] ? new Date(r['closed_at_utc'] as string | Date) : null,
      closedBy: (r['closed_by'] as string | null) ?? null,
      verificationUserId: (r['verification_user_id'] as string | null) ?? null,
      verifiedAtUtc: r['verified_at_utc'] ? new Date(r['verified_at_utc'] as string | Date) : null,
      createdBy: r['created_by'] as string,
      createdAtUtc: new Date(r['created_at_utc'] as string | Date),
      updatedAtUtc: new Date(r['updated_at_utc'] as string | Date),
    };
  }

  private parseArray(val: unknown): string[] {
    if (!val) return [];
    if (Array.isArray(val)) return val as string[];
    if (typeof val === 'string') {
      const trimmed = val.replace(/^\{|\}$/g, '');
      if (!trimmed) return [];
      return trimmed.split(',').map((s) => s.replace(/^"|"$/g, '').trim());
    }
    return [];
  }
}
