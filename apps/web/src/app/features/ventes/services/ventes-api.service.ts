import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Customer {
  id: string;
  code: string;
  name: string;
  defaultCurrency: string;
  paymentTermsDays: number;
  isActive: boolean;
}

export interface SaleContract {
  id: string;
  customerId: string;
  reference: string;
  calibreCode: string;
  unitPriceMinorUnits: string;
  currency: string;
  plannedTonnageT: string;
  periodFrom: string;
  periodTo: string;
  isExport: boolean;
}

export interface BonDeLivraison {
  id: string;
  number: string;
  customerId: string;
  saleContractId: string;
  stockpileId: string;
  calibreCode: string;
  tonnageKg: string;
  deliveryDate: string;
  status: 'draft' | 'pending_signature' | 'signed' | 'cancelled';
  signedAtUtc: string | null;
  contentSha256: string | null;
}

export interface Invoice {
  id: string;
  number: string;
  customerId: string;
  blIds: string[];
  subtotalMinorUnits: string;
  totalMinorUnits: string;
  currency: string;
  fxRateToXof: string | null;
  totalXofMinorUnits: string | null;
  issueDate: string;
  status: 'draft' | 'sent' | 'paid' | 'cancelled';
}

@Injectable({ providedIn: 'root' })
export class VentesApiService {
  private readonly http = inject(HttpClient);

  listCustomers(): Observable<Customer[]> {
    return this.http.get<Customer[]>('/api/ventes/customers');
  }

  listContracts(customerId?: string): Observable<SaleContract[]> {
    return this.http.get<SaleContract[]>('/api/ventes/contracts', {
      params: customerId ? { customerId } : {},
    });
  }

  listBLs(status?: BonDeLivraison['status']): Observable<BonDeLivraison[]> {
    return this.http.get<BonDeLivraison[]>('/api/ventes/bl', {
      params: status ? { status } : {},
    });
  }

  listInvoices(customerId?: string): Observable<Invoice[]> {
    return this.http.get<Invoice[]>('/api/ventes/invoices', {
      params: customerId ? { customerId } : {},
    });
  }
}
