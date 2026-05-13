import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface ExplosivesEventRow {
  id: string;
  occurredAtUtc: string;
  eventType: string;
  productType: string;
  quantityG: string;
  docReference: string | null;
  pdfSha256: string | null;
  blastPlanId: string | null;
}

export interface BlastPlanRow {
  id: string;
  status: string;
  createdAtUtc: string;
  operationalDayId: string;
  plannedBy: string;
  hseApprovedBy: string | null;
  drillingPlanId: string;
}

export interface BlastReportPayload {
  tenantId: string;
  siteId: string;
  blastPlanId: string;
  fragmentationObs: string;
  vibrationMmS?: number | null;
  incidentIds?: string[];
  notesMd?: string | null;
  reporterId: string;
}

const API = environment.apiUrl;

/**
 * TirApiService — HTTP client for the TIR module backend.
 */
@Injectable({ providedIn: 'root' })
export class TirApiService {
  constructor(private readonly http: HttpClient) {}

  // ── Explosives Ledger ──────────────────────────────────────────────────────

  getExplosivesBalance(siteId: string, tenantId: string, operationalDayId: string): Observable<Record<string, number>> {
    return this.http.get<Record<string, number>>(
      `${API}/explosives-ledger/balance/${siteId}`,
      { params: { tenantId, operationalDayId } },
    );
  }

  appendExplosivesEvent(payload: Record<string, unknown>): Observable<ExplosivesEventRow> {
    return this.http.post<ExplosivesEventRow>(`${API}/explosives-ledger`, payload);
  }

  // ── Blast Plans ────────────────────────────────────────────────────────────

  listBlastPlans(tenantId: string, siteId: string): Observable<BlastPlanRow[]> {
    return this.http.get<BlastPlanRow[]>(`${API}/blast-plans`, {
      params: { tenantId, siteId },
    });
  }

  getBlastPlan(id: string, tenantId: string): Observable<BlastPlanRow> {
    return this.http.get<BlastPlanRow>(`${API}/blast-plans/${id}`, {
      params: { tenantId },
    });
  }

  approveHse(id: string, payload: { hseOfficerId: string; tenantId: string }): Observable<BlastPlanRow> {
    return this.http.post<BlastPlanRow>(`${API}/blast-plans/${id}/approve-hse`, payload);
  }

  approveLoading(id: string, payload: Record<string, unknown>): Observable<BlastPlanRow> {
    return this.http.post<BlastPlanRow>(`${API}/blast-plans/${id}/approve-loading`, payload);
  }

  requestFire(id: string, payload: Record<string, unknown>): Observable<BlastPlanRow> {
    return this.http.post<BlastPlanRow>(`${API}/blast-plans/${id}/request-fire`, payload);
  }

  issueClearance(id: string, payload: { hseOfficerId: string; tenantId: string }): Observable<{ clearanceToken: string }> {
    return this.http.post<{ clearanceToken: string }>(`${API}/blast-plans/${id}/issue-clearance`, payload);
  }

  // ── Blast Report ───────────────────────────────────────────────────────────

  submitBlastReport(payload: BlastReportPayload): Observable<unknown> {
    return this.http.post(`${API}/blast-report`, payload);
  }
}
