import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface BudgetVsActual {
  category: string;
  budgetMinor: string;
  actualMinor: string;
  variancePct: number;
  status: 'on_track' | 'warning' | 'over';
}

export interface MarginReport {
  scope: string;
  scopeId: string;
  revenueMinor: string;
  costMinor: string;
  marginMinor: string;
  marginPct: number;
  currency: string;
}

export interface ConsolidatedPnL {
  pivotCurrency: string;
  periodFrom: string;
  periodTo: string;
  bySite: Array<{
    siteId: string;
    revenueMinor: string;
    costMinor: string;
    marginMinor: string;
    tonnageT: number;
  }>;
  totalRevenueMinor: string;
  totalCostMinor: string;
  totalMarginMinor: string;
  marginPct: number;
}

@Injectable({ providedIn: 'root' })
export class FinanceApiService {
  private readonly http = inject(HttpClient);

  budgetVsActual(siteId: string, year: number, asOfDate: string): Observable<BudgetVsActual[]> {
    return this.http.get<BudgetVsActual[]>('/api/analytics/budget/comparison', {
      params: { siteId, year: String(year), asOfDate },
    });
  }

  marginByContract(contractId: string, asOfDate: string): Observable<MarginReport> {
    return this.http.get<MarginReport>(`/api/analytics/margin/contract/${contractId}`, {
      params: { asOfDate },
    });
  }

  marginBySite(siteId: string, from: string, to: string): Observable<MarginReport> {
    return this.http.get<MarginReport>(`/api/analytics/margin/site/${siteId}`, {
      params: { from, to },
    });
  }

  consolidate(pivot: 'XOF' | 'EUR', from: string, to: string): Observable<ConsolidatedPnL> {
    return this.http.get<ConsolidatedPnL>('/api/analytics/consolidation', {
      params: { pivot, from, to },
    });
  }

  ohadaExport(siteId: string, from: string, to: string, target: 'sage' | 'ciel' | 'odoo'): Observable<{ csv: string }> {
    return this.http.get<{ csv: string }>('/api/analytics/ohada-export', {
      params: { siteId, from, to, target },
    });
  }
}
