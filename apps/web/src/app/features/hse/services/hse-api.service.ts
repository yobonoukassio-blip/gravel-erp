import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Observable } from 'rxjs';

export type HseCategory =
  | 'accident_personnel'
  | 'accident_materiel'
  | 'near_miss'
  | 'environnement'
  | 'securite'
  | 'autre';

export type IncidentStatus = 'open' | 'under_investigation' | 'closed';
export type CapaStatus = 'open' | 'in_progress' | 'done' | 'verified' | 'closed';
export type CapaPriority = 'low' | 'medium' | 'high' | 'critical';

export interface HseIncidentRow {
  id: string;
  site_id: string;
  occurred_at_utc: string;
  category: HseCategory;
  severity: number;
  location_text: string;
  reporter_user_id: string;
  status: IncidentStatus;
  chronology_md: string;
  people_impacted: Array<{
    name?: string;
    injury_type?: string;
    body_part?: string;
    lost_time_h: number;
  }>;
  equipment_impacted_ids: string[];
  content_addressed_attachments: string[];
}

export interface CorrectiveActionRow {
  id: string;
  incident_id: string;
  description: string;
  assigned_to_user_id: string;
  due_date_local: string;
  priority: CapaPriority;
  status: CapaStatus;
  closed_evidence_attachments: string[];
}

// HSE-03 — EPI
export type EpiCategory =
  | 'casque'
  | 'gilet'
  | 'chaussures'
  | 'gants'
  | 'masque'
  | 'lunettes'
  | 'harnais'
  | 'bouchons'
  | 'autre';

export type EpiCondition = 'good' | 'damaged' | 'condemned';

export interface EpiItemRow {
  id: string;
  tenantId: string;
  name: string;
  category: EpiCategory;
  description: string | null;
  isMandatory: boolean;
  createdAtUtc: string;
}

export interface EpiAssignmentRow {
  id: string;
  tenantId: string;
  employeeId: string;
  epiItemId: string;
  issuedAtUtc: string;
  issuedBy: string;
  returnedAtUtc: string | null;
  returnedBy: string | null;
  condition: EpiCondition;
  notes: string | null;
  epiItem?: EpiItemRow;
}

export interface EpiComplianceRow {
  employeeId: string;
  missingCategories: EpiCategory[];
  missingItemNames: string[];
}

@Injectable({ providedIn: 'root' })
export class HseApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/hse-incidents';
  private readonly epiBase = '/api/hse/epi';

  listIncidents(siteId?: string): Observable<HseIncidentRow[]> {
    const params: Record<string, string> | undefined = siteId ? { site_id: siteId } : undefined;
    return this.http.get<HseIncidentRow[]>(this.base, { params });
  }

  getIncident(id: string): Observable<HseIncidentRow> {
    return this.http.get<HseIncidentRow>(`${this.base}/${id}`);
  }

  listCapas(incidentId: string): Observable<CorrectiveActionRow[]> {
    return this.http.get<CorrectiveActionRow[]>(
      `/api/corrective-actions?incident_id=${incidentId}`,
    );
  }

  // ----- HSE-03 EPI -----
  listEpiItems(): Observable<EpiItemRow[]> {
    return this.http.get<EpiItemRow[]>(`${this.epiBase}/items`);
  }

  createEpiItem(input: {
    name: string;
    category: EpiCategory;
    description?: string | null;
    isMandatory?: boolean;
  }): Observable<EpiItemRow> {
    return this.http.post<EpiItemRow>(`${this.epiBase}/items`, input);
  }

  listOpenAssignmentsFor(employeeId: string): Observable<EpiAssignmentRow[]> {
    return this.http.get<EpiAssignmentRow[]>(
      `${this.epiBase}/employees/${employeeId}/open`,
    );
  }

  issueEpi(input: {
    employeeId: string;
    epiItemId: string;
    notes?: string | null;
  }): Observable<EpiAssignmentRow> {
    return this.http.post<EpiAssignmentRow>(
      `${this.epiBase}/assignments/issue`,
      input,
    );
  }

  returnEpi(
    assignmentId: string,
    input: { condition?: EpiCondition } = {},
  ): Observable<EpiAssignmentRow> {
    return this.http.post<EpiAssignmentRow>(
      `${this.epiBase}/assignments/${assignmentId}/return`,
      input,
    );
  }

  checkEpiCompliance(employeeIds: string[]): Observable<EpiComplianceRow[]> {
    const csv = employeeIds.join(',');
    return this.http.get<EpiComplianceRow[]>(`${this.epiBase}/compliance`, {
      params: { employeeIds: csv },
    });
  }
}
