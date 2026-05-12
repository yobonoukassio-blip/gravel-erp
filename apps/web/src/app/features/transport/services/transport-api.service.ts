import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface WeighingTicket {
  id: string;
  ticket_number: string;
  gross_kg: number;
  tare_kg: number;
  net_kg: number;
  truck_equipment_id: string;
  driver_id: string;
  material_type: 'granite_brut' | 'tout_venant' | 'sterile';
  weighed_at_local: string;
  iana_timezone: string;
  operational_day_id: string;
  weighing_station_code: string;
  client_signature_blob_sha256: string | null;
  driver_signature_blob_sha256: string | null;
  is_offline_generated: boolean;
  content_hash: string;
  created_at_utc: string;
}

export interface TruckRotation {
  id: string;
  operational_day_id: string;
  truck_equipment_id: string | null;
  driver_id: string | null;
  loaded_at_bench_id: string;
  unloaded_at_zone_id: string;
  material_type: 'granite_brut' | 'tout_venant' | 'sterile';
  loaded_tonnage_t: string;
  weighing_ticket_id: string;
  loaded_at_utc: string;
  unloaded_at_utc: string | null;
  cycle_time_minutes: string | null;
}

export interface ProductionEquipment {
  id: string;
  code: string;
  label: string;
  type: 'drill' | 'excavator' | 'truck' | 'generator';
  status: 'active' | 'maintenance' | 'out_of_service';
}

@Injectable({ providedIn: 'root' })
export class TransportApiService {
  private readonly http = inject(HttpClient);

  listRotations(operationalDayId: string): Observable<TruckRotation[]> {
    return this.http.get<TruckRotation[]>(
      `/api/rotations?operational_day_id=${operationalDayId}`,
    );
  }

  listPendingDispatch(): Observable<TruckRotation[]> {
    return this.http.get<TruckRotation[]>('/api/rotations/pending-dispatch');
  }

  assignTruck(rotationId: string, truckEquipmentId: string): Observable<TruckRotation> {
    return this.http.post<TruckRotation>(`/api/rotations/${rotationId}/assign`, {
      truck_equipment_id: truckEquipmentId,
    });
  }

  completeRotation(rotationId: string, unloadedAtUtc: string): Observable<TruckRotation> {
    return this.http.post<TruckRotation>(`/api/rotations/${rotationId}/complete`, {
      unloaded_at_utc: unloadedAtUtc,
    });
  }

  listTickets(operationalDayId: string): Observable<WeighingTicket[]> {
    return this.http.get<WeighingTicket[]>(
      `/api/weighing-tickets?operational_day_id=${operationalDayId}`,
    );
  }

  listAvailableTrucks(): Observable<ProductionEquipment[]> {
    return this.http.get<ProductionEquipment[]>(
      '/api/master-data/equipment?type=truck&status=active',
    );
  }
}
