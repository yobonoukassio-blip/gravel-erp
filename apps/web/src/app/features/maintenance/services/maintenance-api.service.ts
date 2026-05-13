import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface WorkOrder {
  id: string;
  equipmentId: string;
  type: 'corrective' | 'preventive';
  status: 'open' | 'in_progress' | 'closed' | 'cancelled';
  diagnosis: string | null;
  resolution: string | null;
  downtimeMinutes: number;
  laborHours: string;
  openedAtUtc: string;
  closedAtUtc: string | null;
}

export interface SparePart {
  id: string;
  sku: string;
  label: string;
  quantityOnHand: number;
  thresholdMin: number | null;
  belowThreshold: boolean;
}

export interface EquipmentAvailability {
  equipmentId: string;
  equipmentLabel: string;
  mtbfHours: number | null;
  mttrHours: number | null;
  failureCount: number;
  status: string;
}

@Injectable({ providedIn: 'root' })
export class MaintenanceApiService {
  private readonly http = inject(HttpClient);

  listWorkOrders(siteId: string): Observable<WorkOrder[]> {
    return this.http.get<WorkOrder[]>('/api/maintenance/work-orders', { params: { siteId } });
  }

  listSpareParts(siteId: string): Observable<SparePart[]> {
    return this.http.get<SparePart[]>('/api/maintenance/spare-parts', { params: { siteId } });
  }

  availabilityKpi(siteId: string): Observable<EquipmentAvailability[]> {
    return this.http.get<EquipmentAvailability[]>('/api/dashboard/maintenance-kpis', {
      params: { siteId },
    });
  }
}
