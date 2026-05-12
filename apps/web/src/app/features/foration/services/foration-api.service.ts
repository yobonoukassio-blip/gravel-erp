import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface DrillingPlan {
  id: string;
  site_id: string;
  zone_id: string;
  bench_id: string;
  planned_hole_count: number;
  target_depth_m: number;
  diameter_mm: number;
  assigned_operator_id: string | null;
  assigned_machine_id: string | null;
  valid_from: string;
  valid_to: string | null;
  status: 'draft' | 'active' | 'closed' | 'archived';
  created_by: string;
  created_at: string;
}

export interface DrilledHole {
  id: string;
  plan_id: string;
  hole_index_in_plan: number;
  actual_depth_m: number;
  actual_diameter_mm: number;
  gps_point: { type: 'Point'; coordinates: [number, number] } | null;
  gps_accuracy_m: number | null;
  inclination_deg: number | null;
  fuel_liters_consumed: number | null;
  operator_id: string;
  machine_id: string;
  tolerance_violation: boolean;
  tolerance_violation_reason: string | null;
  corrects_hole_id: string | null;
}

export interface CreateDrillingPlanDto {
  site_id: string;
  zone_id: string;
  bench_id: string;
  planned_hole_count: number;
  target_depth_m: number;
  diameter_mm: number;
  assigned_operator_id?: string | null;
  assigned_machine_id?: string | null;
  valid_from: string;
  valid_to?: string | null;
}

@Injectable({ providedIn: 'root' })
export class ForationApiService {
  private readonly http = inject(HttpClient);

  listPlans(siteId?: string): Observable<DrillingPlan[]> {
    const url = siteId ? `/api/drilling-plans?site_id=${siteId}` : '/api/drilling-plans';
    return this.http.get<DrillingPlan[]>(url);
  }

  getPlan(id: string): Observable<DrillingPlan> {
    return this.http.get<DrillingPlan>(`/api/drilling-plans/${id}`);
  }

  createPlan(dto: CreateDrillingPlanDto): Observable<DrillingPlan> {
    return this.http.post<DrillingPlan>('/api/drilling-plans', dto);
  }

  updatePlan(id: string, dto: Partial<CreateDrillingPlanDto>): Observable<DrillingPlan> {
    return this.http.patch<DrillingPlan>(`/api/drilling-plans/${id}`, dto);
  }

  activate(id: string): Observable<DrillingPlan> {
    return this.http.post<DrillingPlan>(`/api/drilling-plans/${id}/activate`, {});
  }

  close(id: string): Observable<DrillingPlan> {
    return this.http.post<DrillingPlan>(`/api/drilling-plans/${id}/close`, {});
  }

  archive(id: string): Observable<DrillingPlan> {
    return this.http.post<DrillingPlan>(`/api/drilling-plans/${id}/archive`, {});
  }

  listHoles(planId: string): Observable<DrilledHole[]> {
    return this.http.get<DrilledHole[]>(`/api/drilled-holes?plan_id=${planId}`);
  }
}
