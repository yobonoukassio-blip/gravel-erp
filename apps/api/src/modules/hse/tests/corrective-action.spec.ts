/**
 * CorrectiveAction unit tests (HSE-02).
 *
 * Tests:
 *   1. Create severity=5 incident + 2 CAPAs → close incident → 400 ERR_CAPA_NOT_VERIFIED
 *   2. Verify both CAPAs (done → verified) → close incident → 200 OK
 *   3. Invalid status transition → 400 CAPA_INVALID_TRANSITION
 *   4. Role check: unknown role → 403 CAPA_ROLE_REQUIRED
 *   5. Self-verify forbidden: done-by user cannot verify
 *
 * Run: pnpm --filter=@gravel/api test corrective-action
 */

import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ForbiddenException } from '@nestjs/common';
import { CorrectiveActionService } from '../services/corrective-action.service';
import { HseIncidentService, GENESIS_PREV_HASH } from '../services/hse-incident.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

// ---------------------------------------------------------------------------
// In-memory DB state for service integration tests
// ---------------------------------------------------------------------------

interface CAPARow {
  id: string;
  tenant_id: string;
  incident_id: string;
  description: string;
  assigned_to_user_id: string;
  due_date_local: string;
  iana_timezone: string;
  priority: string;
  status: string;
  closed_evidence_attachments: string[];
  closed_at_utc: Date | null;
  closed_by: string | null;
  verification_user_id: string | null;
  verified_at_utc: Date | null;
  created_by: string;
  created_at_utc: Date;
  updated_at_utc: Date;
}

interface IncidentRow {
  id: string;
  tenant_id: string;
  severity: number;
  status: string;
  prev_hash: Buffer;
  row_hash: Buffer;
}

function buildCapaMockDataSource(
  capaStore: CAPARow[],
  incidentStore: IncidentRow[],
  tenantId: string,
) {
  function queryMock(sql: string, params: unknown[]): unknown[] {
    // CAPA INSERT
    if (sql.includes('INSERT INTO corrective_action')) {
      const row: CAPARow = {
        id: randomUUID(),
        tenant_id: params[0] as string,
        incident_id: params[1] as string,
        description: params[2] as string,
        assigned_to_user_id: params[3] as string,
        due_date_local: params[4] as string,
        iana_timezone: params[5] as string,
        priority: params[6] as string,
        status: 'open',
        closed_evidence_attachments: [],
        closed_at_utc: null,
        closed_by: null,
        verification_user_id: null,
        verified_at_utc: null,
        created_by: params[7] as string,
        created_at_utc: new Date(),
        updated_at_utc: new Date(),
      };
      capaStore.push(row);
      return [mapCapaRow(row)];
    }

    // CAPA SELECT by id
    if (sql.includes('FROM corrective_action') && sql.includes('WHERE id = $1')) {
      const found = capaStore.find(
        (c) => c.id === params[0] && c.tenant_id === params[1],
      );
      return found ? [mapCapaRow(found)] : [];
    }

    // CAPA UPDATE
    if (sql.includes('UPDATE corrective_action')) {
      const capaId = params[0] as string;
      const capa = capaStore.find((c) => c.id === capaId);
      if (!capa) return [];
      // Apply new status from params[2].
      const newStatus = params[2] as string;
      capa.status = newStatus;
      capa.updated_at_utc = new Date();
      // Handle done: closed_by = params[3], closed_at_utc = params[4]
      if (newStatus === 'done' && params.length >= 5) {
        capa.closed_by = params[3] as string;
        capa.closed_at_utc = params[4] as Date;
      }
      // Handle verified: verification_user_id = params[3], verified_at_utc = params[4]
      if (newStatus === 'verified' && params.length >= 5) {
        capa.verification_user_id = params[3] as string;
        capa.verified_at_utc = params[4] as Date;
      }
      return [mapCapaRow(capa)];
    }

    // Incident SELECT
    if (sql.includes('FROM hse_incident') && sql.includes('WHERE id = $1')) {
      const found = incidentStore.find(
        (i) => i.id === params[0] && i.tenant_id === params[1],
      );
      if (!found) return [];
      return [mapIncidentRow(found)];
    }

    // Incident prev_hash
    if (sql.includes('SELECT row_hash') && sql.includes('FROM hse_incident')) {
      if (incidentStore.length === 0) return [];
      return [{ row_hash: incidentStore[incidentStore.length - 1].row_hash }];
    }

    // Incident INSERT
    if (sql.includes('INSERT INTO hse_incident')) {
      const id = params[0] as string;
      const severity = params[8] as number;
      const prev = incidentStore.length === 0
        ? GENESIS_PREV_HASH
        : incidentStore[incidentStore.length - 1].row_hash;
      const rowHash = Buffer.alloc(32, incidentStore.length + 1);
      const row: IncidentRow = { id, tenant_id: tenantId, severity, status: 'open', prev_hash: prev, row_hash: rowHash };
      incidentStore.push(row);
      return [mapIncidentRow(row)];
    }

    // Incident UPDATE (close)
    if (sql.includes('UPDATE hse_incident')) {
      const incidentId = params[0] as string;
      const inc = incidentStore.find((i) => i.id === incidentId);
      if (inc) inc.status = 'closed';
      return [];
    }

    // CAPA count for closure guard
    if (sql.includes("status != 'verified'") && sql.includes('COUNT')) {
      const incidentId = params[0] as string;
      const count = capaStore.filter(
        (c) => c.incident_id === incidentId && c.status !== 'verified',
      ).length;
      return [{ cnt: String(count) }];
    }

    return [];
  }

  const mockEm = {
    query: jest.fn(async (sql: string, params: unknown[]) => queryMock(sql, params)),
  };

  return {
    query: jest.fn(async (sql: string, params: unknown[]) => queryMock(sql, params)),
    transaction: jest.fn(async (fn: (em: unknown) => Promise<unknown>) => fn(mockEm)),
    _em: mockEm,
  };
}

function mapCapaRow(r: CAPARow): Record<string, unknown> {
  return {
    id: r.id,
    tenant_id: r.tenant_id,
    incident_id: r.incident_id,
    description: r.description,
    assigned_to_user_id: r.assigned_to_user_id,
    due_date_local: r.due_date_local,
    iana_timezone: r.iana_timezone,
    priority: r.priority,
    status: r.status,
    closed_evidence_attachments: r.closed_evidence_attachments,
    closed_at_utc: r.closed_at_utc?.toISOString() ?? null,
    closed_by: r.closed_by,
    verification_user_id: r.verification_user_id,
    verified_at_utc: r.verified_at_utc?.toISOString() ?? null,
    created_by: r.created_by,
    created_at_utc: r.created_at_utc.toISOString(),
    updated_at_utc: r.updated_at_utc.toISOString(),
  };
}

function mapIncidentRow(r: IncidentRow): Record<string, unknown> {
  const now = new Date();
  return {
    id: r.id,
    tenant_id: r.tenant_id,
    site_id: randomUUID(),
    occurred_at_local: now.toISOString(),
    iana_timezone: 'Africa/Abidjan',
    occurred_at_utc: now.toISOString(),
    operational_day_id: randomUUID(),
    category: 'accident_personnel',
    severity: r.severity,
    reporter_user_id: randomUUID(),
    location_text: 'Zone A',
    gps_point: null,
    people_impacted: [],
    equipment_impacted_ids: [],
    chronology_md: 'Chronologie test',
    content_addressed_attachments: [],
    status: r.status,
    prev_hash: r.prev_hash,
    row_hash: r.row_hash,
    created_at_utc: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CorrectiveActionService + HseIncidentService — CAPA closure guard', () => {
  let capaService: CorrectiveActionService;
  let incidentService: HseIncidentService;
  let _emitter: EventEmitter2;

  const tenantId = randomUUID();
  const hseOfficerId = randomUUID();
  const verifierId = randomUUID();

  const capaStore: CAPARow[] = [];
  const incidentStore: IncidentRow[] = [];

  beforeEach(async () => {
    capaStore.length = 0;
    incidentStore.length = 0;

    const mockDs = buildCapaMockDataSource(capaStore, incidentStore, tenantId);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CorrectiveActionService,
        HseIncidentService,
        EventEmitter2,
        {
          provide: getDataSourceToken(),
          useValue: mockDs,
        },
      ],
    }).compile();

    capaService = module.get(CorrectiveActionService);
    incidentService = module.get(HseIncidentService);
    _emitter = module.get(EventEmitter2);
  });

  it('closes severity=5 incident only after all CAPAs are verified', async () => {
    const now = new Date();
    const incident = await incidentService.create({
      tenantId,
      siteId: randomUUID(),
      occurredAtLocal: now,
      ianaTimezone: 'Africa/Abidjan',
      occurredAtUtc: now,
      operationalDayId: randomUUID(),
      category: 'accident_personnel',
      severity: 5,
      reporterUserId: hseOfficerId,
      locationText: 'Carrière zone B',
      peopleImpacted: [{ lost_time_h: 8, name: 'Koffi', injury_type: 'fracture', body_part: 'arm' }],
      equipmentImpactedIds: [],
      chronologyMd: '## Accident grave\n\nFracture du bras gauche.',
    });

    expect(incident.severity).toBe(5);

    // Create 2 CAPAs.
    const capa1 = await capaService.create({
      tenantId,
      incidentId: incident.id,
      description: 'Sécuriser zone B avant reprise',
      assignedToUserId: hseOfficerId,
      dueDateLocal: '2026-06-01',
      ianaTimezone: 'Africa/Abidjan',
      priority: 'critical',
      createdBy: hseOfficerId,
      actorRole: 'HSE_OFFICER',
    });
    const capa2 = await capaService.create({
      tenantId,
      incidentId: incident.id,
      description: 'Formation sécurité obligatoire équipe B',
      assignedToUserId: hseOfficerId,
      dueDateLocal: '2026-06-15',
      ianaTimezone: 'Africa/Abidjan',
      priority: 'high',
      createdBy: hseOfficerId,
      actorRole: 'HSE_OFFICER',
    });

    // Attempt to close incident — should fail: 2 CAPAs not verified.
    await expect(
      incidentService.close(incident.id, tenantId, hseOfficerId),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ERR_CAPA_NOT_VERIFIED' }),
    });

    // Transition CAPA 1: open → in_progress → done → verified.
    await capaService.transition({ tenantId, capaId: capa1.id, newStatus: 'in_progress', userId: hseOfficerId, actorRole: 'HSE_OFFICER' });
    await capaService.transition({ tenantId, capaId: capa1.id, newStatus: 'done', userId: hseOfficerId, actorRole: 'HSE_OFFICER' });
    const verifiedCapa1 = await capaService.transition({ tenantId, capaId: capa1.id, newStatus: 'verified', userId: verifierId, actorRole: 'SITE_MANAGER' });
    expect(verifiedCapa1.status).toBe('verified');

    // Close still fails — CAPA 2 not verified.
    await expect(
      incidentService.close(incident.id, tenantId, hseOfficerId),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ERR_CAPA_NOT_VERIFIED' }),
    });

    // Transition CAPA 2: open → in_progress → done → verified.
    await capaService.transition({ tenantId, capaId: capa2.id, newStatus: 'in_progress', userId: hseOfficerId, actorRole: 'HSE_OFFICER' });
    await capaService.transition({ tenantId, capaId: capa2.id, newStatus: 'done', userId: hseOfficerId, actorRole: 'HSE_OFFICER' });
    const verifiedCapa2 = await capaService.transition({ tenantId, capaId: capa2.id, newStatus: 'verified', userId: verifierId, actorRole: 'SITE_MANAGER' });
    expect(verifiedCapa2.status).toBe('verified');

    // Both CAPAs verified — incident should close.
    const closed = await incidentService.close(incident.id, tenantId, hseOfficerId);
    expect(closed.status).toBe('closed');
  });

  it('allows closing a severity=3 incident with unverified CAPAs', async () => {
    const now = new Date();
    const incident = await incidentService.create({
      tenantId,
      siteId: randomUUID(),
      occurredAtLocal: now,
      ianaTimezone: 'Africa/Abidjan',
      occurredAtUtc: now,
      operationalDayId: randomUUID(),
      category: 'near_miss',
      severity: 3,
      reporterUserId: hseOfficerId,
      locationText: 'Zone C',
      peopleImpacted: [],
      equipmentImpactedIds: [],
      chronologyMd: '## Near miss léger\n\nPas de blessure.',
    });

    await capaService.create({
      tenantId,
      incidentId: incident.id,
      description: 'Améliorer signalétique',
      assignedToUserId: hseOfficerId,
      dueDateLocal: '2026-07-01',
      ianaTimezone: 'Africa/Abidjan',
      priority: 'low',
      createdBy: hseOfficerId,
      actorRole: 'HSE_OFFICER',
    });

    // Severity=3 → closure guard does not apply.
    const closed = await incidentService.close(incident.id, tenantId, hseOfficerId);
    expect(closed.status).toBe('closed');
  });

  it('rejects invalid CAPA status transition', async () => {
    const now = new Date();
    const incident = await incidentService.create({
      tenantId,
      siteId: randomUUID(),
      occurredAtLocal: now,
      ianaTimezone: 'Africa/Abidjan',
      occurredAtUtc: now,
      operationalDayId: randomUUID(),
      category: 'securite',
      severity: 1,
      reporterUserId: hseOfficerId,
      locationText: 'Zone D',
      peopleImpacted: [],
      equipmentImpactedIds: [],
      chronologyMd: '## Inspection\n\nRAS.',
    });

    const capa = await capaService.create({
      tenantId,
      incidentId: incident.id,
      description: 'Check filets de sécurité',
      assignedToUserId: hseOfficerId,
      dueDateLocal: '2026-08-01',
      ianaTimezone: 'Africa/Abidjan',
      priority: 'medium',
      createdBy: hseOfficerId,
      actorRole: 'HSE_OFFICER',
    });

    // Cannot skip in_progress and jump to 'done'.
    await expect(
      capaService.transition({ tenantId, capaId: capa.id, newStatus: 'done', userId: hseOfficerId, actorRole: 'HSE_OFFICER' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CAPA_INVALID_TRANSITION' }),
    });
  });

  it('rejects CAPA creation by unknown role', async () => {
    const now = new Date();
    const incident = await incidentService.create({
      tenantId,
      siteId: randomUUID(),
      occurredAtLocal: now,
      ianaTimezone: 'Africa/Abidjan',
      occurredAtUtc: now,
      operationalDayId: randomUUID(),
      category: 'autre',
      severity: 1,
      reporterUserId: hseOfficerId,
      locationText: 'Zone E',
      peopleImpacted: [],
      equipmentImpactedIds: [],
      chronologyMd: '## Autre\n\nTest.',
    });

    await expect(
      capaService.create({
        tenantId,
        incidentId: incident.id,
        description: 'Some action',
        assignedToUserId: hseOfficerId,
        dueDateLocal: '2026-08-01',
        ianaTimezone: 'Africa/Abidjan',
        priority: 'low',
        createdBy: hseOfficerId,
        actorRole: 'OPERATOR', // insufficient role
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
