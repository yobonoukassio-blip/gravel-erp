import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CrusherSession {
  id: string;
  tenantId: string;
  siteId: string;
  operationalDayId: string;
  crusherId: string;
  inputZoneId: string | null;
  outputStockpileId: string;
  materialType: string;
  calibreCode: string;
  inputTonnageKg: number;
  outputTonnageKg: number;
  energyKwh: number;
  operatingHours: number;
  performancePct: number;
  sessionStartUtc: string;
  sessionEndUtc: string | null;
  operatorId: string;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  notesMd: string | null;
}

export interface ScreeningSession {
  id: string;
  tenantId: string;
  siteId: string;
  operationalDayId: string;
  screenId: string;
  inputStockpileId: string | null;
  sessionStartUtc: string;
  sessionEndUtc: string | null;
  inputTonnageKg: number;
  calibreYields: CalibreYield[];
  operatorId: string;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  notesMd: string | null;
}

export interface CalibreYield {
  calibre_code: string;
  output_stockpile_id: string;
  tonnage_kg: number;
  is_nonconforming: boolean;
  nonconformity_reason: string | null;
}

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
  notesMd?: string | null;
}

export interface CompleteCrusherSessionDto {
  inputTonnageKg: number;
  outputTonnageKg: number;
  energyKwh: number;
  operatingHours: number;
  yearMonth: string;
  operatorId: string;
  notesMd?: string | null;
}

export interface OpenScreeningSessionDto {
  tenantId: string;
  siteId: string;
  operationalDayId: string;
  screenId: string;
  inputStockpileId?: string | null;
  operatorId: string;
  notesMd?: string | null;
}

export interface CompleteScreeningSessionDto {
  inputTonnageKg: number;
  calibreYields: CalibreYield[];
  operatorId: string;
  notesMd?: string | null;
}

export interface CrusherSessionFilters {
  tenantId: string;
  siteId?: string;
  operationalDayId?: string;
  status?: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
}

export interface ScreeningSessionFilters {
  tenantId: string;
  siteId?: string;
  operationalDayId?: string;
  status?: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
}

@Injectable({ providedIn: 'root' })
export class ConcassageApiService {
  private readonly apiBase = '/api';

  constructor(private readonly http: HttpClient) {}

  // ---- Crusher Sessions ----

  openCrusherSession(dto: OpenCrusherSessionDto): Observable<CrusherSession> {
    return this.http.post<CrusherSession>(`${this.apiBase}/crusher-sessions`, dto);
  }

  listCrusherSessions(filters: CrusherSessionFilters): Observable<CrusherSession[]> {
    let params = new HttpParams().set('tenantId', filters.tenantId);
    if (filters.siteId) params = params.set('siteId', filters.siteId);
    if (filters.operationalDayId) params = params.set('operationalDayId', filters.operationalDayId);
    if (filters.status) params = params.set('status', filters.status);
    return this.http.get<CrusherSession[]>(`${this.apiBase}/crusher-sessions`, { params });
  }

  getCrusherSession(id: string, tenantId: string): Observable<CrusherSession> {
    return this.http.get<CrusherSession>(`${this.apiBase}/crusher-sessions/${id}`, {
      params: new HttpParams().set('tenantId', tenantId),
    });
  }

  pauseCrusherSession(id: string): Observable<CrusherSession> {
    return this.http.put<CrusherSession>(`${this.apiBase}/crusher-sessions/${id}/pause`, {});
  }

  resumeCrusherSession(id: string): Observable<CrusherSession> {
    return this.http.put<CrusherSession>(`${this.apiBase}/crusher-sessions/${id}/resume`, {});
  }

  completeCrusherSession(id: string, dto: CompleteCrusherSessionDto): Observable<CrusherSession> {
    return this.http.put<CrusherSession>(`${this.apiBase}/crusher-sessions/${id}/complete`, dto);
  }

  // ---- Screening Sessions ----

  openScreeningSession(dto: OpenScreeningSessionDto): Observable<ScreeningSession> {
    return this.http.post<ScreeningSession>(`${this.apiBase}/screening-sessions`, dto);
  }

  listScreeningSessions(filters: ScreeningSessionFilters): Observable<ScreeningSession[]> {
    let params = new HttpParams().set('tenantId', filters.tenantId);
    if (filters.siteId) params = params.set('siteId', filters.siteId);
    if (filters.operationalDayId) params = params.set('operationalDayId', filters.operationalDayId);
    if (filters.status) params = params.set('status', filters.status);
    return this.http.get<ScreeningSession[]>(`${this.apiBase}/screening-sessions`, { params });
  }

  getScreeningSession(id: string, tenantId: string): Observable<ScreeningSession> {
    return this.http.get<ScreeningSession>(`${this.apiBase}/screening-sessions/${id}`, {
      params: new HttpParams().set('tenantId', tenantId),
    });
  }

  pauseScreeningSession(id: string): Observable<ScreeningSession> {
    return this.http.put<ScreeningSession>(`${this.apiBase}/screening-sessions/${id}/pause`, {});
  }

  resumeScreeningSession(id: string): Observable<ScreeningSession> {
    return this.http.put<ScreeningSession>(`${this.apiBase}/screening-sessions/${id}/resume`, {});
  }

  completeScreeningSession(id: string, dto: CompleteScreeningSessionDto): Observable<ScreeningSession> {
    return this.http.put<ScreeningSession>(`${this.apiBase}/screening-sessions/${id}/complete`, dto);
  }
}
