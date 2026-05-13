import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface StockpileRow {
  id: string;
  site_id: string;
  name: string;
  material_type: string;
  calibre_code: string;
  is_active: boolean;
}

export interface StockpileEventRow {
  id: string;
  stockpile_id: string;
  event_type: string;
  tonnage_delta_kg: string;
  calibre_code: string;
  occurred_at_utc: string;
  chain_hash: string;
}

export interface StockpileBalance {
  stockpile_id: string;
  calibre_code: string;
  current_tonnage_kg: string;
  last_event_at: string;
}

export interface StockpileThreshold {
  id: string;
  stockpile_id: string;
  calibre_code: string;
  min_tonnage_kg: string | null;
  max_tonnage_kg: string | null;
  is_active: boolean;
}

@Injectable({ providedIn: 'root' })
export class StockpileApiService {
  private readonly http = inject(HttpClient);

  listStockpiles(siteId: string): Observable<StockpileRow[]> {
    return this.http.get<StockpileRow[]>('/api/stockpiles', { params: { site_id: siteId } });
  }

  listEvents(stockpileId: string): Observable<StockpileEventRow[]> {
    return this.http.get<StockpileEventRow[]>('/api/stockpile-events', {
      params: { stockpile_id: stockpileId },
    });
  }

  getBalance(stockpileId: string): Observable<StockpileBalance[]> {
    return this.http.get<StockpileBalance[]>('/api/stockpile-balances', {
      params: { stockpile_id: stockpileId },
    });
  }

  listThresholds(siteId: string): Observable<StockpileThreshold[]> {
    return this.http.get<StockpileThreshold[]>('/api/stockpile-thresholds', {
      params: { site_id: siteId },
    });
  }

  appendAdjustment(dto: {
    site_id: string;
    stockpile_id: string;
    tonnage_delta_kg: number;
    calibre_code: string;
    operational_day_id: string;
    occurred_at_utc: string;
    reason: string;
    photo_sha256: string;
  }): Observable<StockpileEventRow> {
    const { reason, photo_sha256, ...rest } = dto;
    return this.http.post<StockpileEventRow>('/api/stockpile-events', {
      ...rest,
      event_type: 'STOCKPILE_ADJUSTMENT',
      material_type: 'granite_brut',
      source_reference: { reason, photo_sha256 },
    });
  }
}
