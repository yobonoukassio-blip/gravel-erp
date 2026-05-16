import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface FuelTankRow {
  id: string;
  site_id: string;
  code: string;
  label: string;
  capacity_liters: number;
  fuel_type: string;
  balance_liters?: number;
  last_reconciliation_drift_liters?: number;
}

export interface FuelTankEventRow {
  id: string;
  tank_id: string;
  event_type:
    | 'FUEL_DELIVERY_IN'
    | 'FUEL_DISPENSE_OUT'
    | 'FUEL_ADJUSTMENT'
    | 'FUEL_RECONCILIATION';
  liters_delta: string;
  occurred_at_utc: string;
  source_reference: Record<string, unknown>;
  cost_per_liter_minor_units: string | null;
  currency: string | null;
}

export interface EquipmentRefuelRow {
  id: string;
  tank_id: string;
  equipment_id: string;
  operator_id: string;
  liters: string;
  equipment_hour_meter_reading: string;
  hours_since_previous: string | null;
  ratio_liters_per_hour: number | null;
  is_anomaly: boolean;
  operational_day_id: string;
  created_at_local: string;
}

export interface EnergyReadingRow {
  id: string;
  site_id: string;
  year_month: string;
  usage_type: 'concassage' | 'criblage' | 'ateliers' | 'bureaux';
  kwh: string;
  source_meter_code: string | null;
  notes: string | null;
}

export interface CreateFuelDeliveryDto {
  site_id: string;
  tank_id: string;
  supplier_bl_number: string;
  liters: number;
  cost_per_liter_minor_units: number;
  currency: string;
  supplier_bl_sha256: string;
  operational_day_id: string;
  occurred_at_utc: string;
}

export interface UpsertEnergyReadingDto {
  site_id: string;
  year_month: string;
  usage_type: 'concassage' | 'criblage' | 'ateliers' | 'bureaux';
  kwh: number;
  source_meter_code?: string | null;
  notes?: string | null;
}

@Injectable({ providedIn: 'root' })
export class FuelApiService {
  private readonly http = inject(HttpClient);

  listTanks(siteId: string): Observable<FuelTankRow[]> {
    return this.http.get<FuelTankRow[]>('/api/fuel-tanks', { params: { site_id: siteId } });
  }

  listEvents(tankId: string): Observable<FuelTankEventRow[]> {
    return this.http.get<FuelTankEventRow[]>('/api/fuel-tank-events', {
      params: { tank_id: tankId },
    });
  }

  listRefuels(siteId: string): Observable<EquipmentRefuelRow[]> {
    return this.http.get<EquipmentRefuelRow[]>('/api/equipment-refuels', {
      params: { site_id: siteId },
    });
  }

  createDelivery(dto: CreateFuelDeliveryDto): Observable<FuelTankEventRow> {
    return this.http.post<FuelTankEventRow>('/api/fuel-tank-events', {
      tank_id: dto.tank_id,
      event_type: 'FUEL_DELIVERY_IN',
      liters_delta: dto.liters,
      operational_day_id: dto.operational_day_id,
      occurred_at_utc: dto.occurred_at_utc,
      cost_per_liter_minor_units: dto.cost_per_liter_minor_units,
      currency: dto.currency,
      source_reference: {
        supplier_bl_number: dto.supplier_bl_number,
        supplier_bl_sha256: dto.supplier_bl_sha256,
      },
    });
  }

  listEnergyReadings(siteId: string, yearMonth?: string): Observable<EnergyReadingRow[]> {
    const params: Record<string, string> = { site_id: siteId };
    if (yearMonth) params['year_month'] = yearMonth;
    return this.http.get<EnergyReadingRow[]>('/api/energy-readings', { params });
  }

  upsertEnergyReading(dto: UpsertEnergyReadingDto): Observable<EnergyReadingRow> {
    return this.http.post<EnergyReadingRow>('/api/energy-readings', dto);
  }
}
