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

@Injectable({ providedIn: 'root' })
export class HseApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/hse-incidents';

  listIncidents(siteId?: string): Observable<HseIncidentRow[]> {
    const params = siteId ? { site_id: siteId } : {};
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
}
