import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import type { ContractType } from './rh-api.types';

export type { ContractType };

export interface EmployeeRow {
  id: string;
  tenant_id: string;
  site_id: string | null;
  subcontractor_id: string | null;
  first_name: string;
  last_name: string;
  employee_number: string | null;
  contract_type: ContractType;
  role_code: string;
  is_active: boolean;
  hired_date: string | null;
  created_at_utc: string;
}

export interface CertificationRow {
  id: string;
  tenant_id: string;
  employee_id: string;
  certification_type_id: string;
  cert_code: string;
  cert_label: string;
  valid_from: string;
  valid_to: string;
  certificate_number: string | null;
  /** Computed client-side: VALID | EXPIRING_SOON | EXPIRED */
  status?: CertStatus;
}

export type CertStatus = 'VALID' | 'EXPIRING_SOON' | 'EXPIRED';

export interface CreateEmployeeInput {
  tenantId: string;
  siteId?: string | null;
  subcontractorId?: string | null;
  firstName: string;
  lastName: string;
  employeeNumber?: string | null;
  contractType: ContractType;
  roleCode: string;
  hiredDate?: string | null;
  createdBy: string;
}

export interface ShiftRosterRow {
  id: string;
  tenant_id: string;
  site_id: string;
  roster_date: string;
  roster_jsonb: Array<{ employee_id: string; position_code: string; shift_type: 'JOUR' | 'NUIT' }>;
  version: number;
}

/**
 * RhApiService — HTTP client for RH module endpoints.
 */
@Injectable({ providedIn: 'root' })
export class RhApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/rh';

  listEmployees(params: {
    tenantId: string;
    siteId?: string;
    isActive?: boolean;
    certCode?: string;
    certValidAsOf?: string;
  }): Observable<EmployeeRow[]> {
    const queryParams: Record<string, string> = { tenant_id: params.tenantId };
    if (params.siteId) queryParams['site_id'] = params.siteId;
    if (params.isActive !== undefined) queryParams['is_active'] = String(params.isActive);
    if (params.certCode) queryParams['cert_code'] = params.certCode;
    if (params.certValidAsOf) queryParams['cert_valid_as_of'] = params.certValidAsOf;

    return this.http.get<EmployeeRow[]>(`${this.base}/employees`, { params: queryParams });
  }

  getEmployee(id: string, tenantId: string): Observable<EmployeeRow> {
    return this.http.get<EmployeeRow>(`${this.base}/employees/${id}`, {
      params: { tenant_id: tenantId },
    });
  }

  createEmployee(input: CreateEmployeeInput): Observable<EmployeeRow> {
    return this.http.post<EmployeeRow>(`${this.base}/employees`, input);
  }

  updateEmployee(id: string, tenantId: string, input: Partial<EmployeeRow>): Observable<EmployeeRow> {
    return this.http.patch<EmployeeRow>(`${this.base}/employees/${id}`, input, {
      params: { tenant_id: tenantId },
    });
  }

  listCertifications(siteId: string, tenantId: string): Observable<CertificationRow[]> {
    return this.http.get<CertificationRow[]>(`${this.base}/employees/certifications`, {
      params: { site_id: siteId, tenant_id: tenantId },
    });
  }

  checkHabilitation(
    employeeId: string,
    certCode: string,
    asOf: string,
  ): Observable<{ valid: boolean }> {
    return this.http.get<{ valid: boolean }>(
      `${this.base}/employees/${employeeId}/habilitation/${certCode}`,
      { params: { as_of: asOf } },
    );
  }

  getShiftRostersForWeek(params: {
    tenantId: string;
    siteId: string;
    weekStart: string;
  }): Observable<ShiftRosterRow[]> {
    return this.http.get<ShiftRosterRow[]>(`${this.base}/shift-rosters`, {
      params: {
        tenant_id: params.tenantId,
        site_id: params.siteId,
        week_start: params.weekStart,
      },
    });
  }

  upsertShiftRoster(input: {
    tenantId: string;
    siteId: string;
    rosterDate: string;
    rosterSlots: ShiftRosterRow['roster_jsonb'];
    version?: number;
  }): Observable<ShiftRosterRow> {
    return this.http.put<ShiftRosterRow>(`${this.base}/shift-rosters`, input);
  }
}
