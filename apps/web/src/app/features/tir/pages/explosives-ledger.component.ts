import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ExplosivesEventRow, TirApiService } from '../services/tir-api.service';

/**
 * ExplosivesLedgerComponent — TIR-01 Web.
 *
 * AG Grid listing of explosives_event rows (read-only + Add Receipt action).
 * - Columns: occurred_at, event_type (badge), product_type, quantity_g (signed),
 *   doc_reference, pdf_sha256 (S3 link if present, else "Generating…")
 * - Filter by product_type, event_type, date_range
 * - CASL guard: TIR_SUPERVISOR or HR_MANAGER
 */
@Component({
  selector: 'app-explosives-ledger',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-container">
      <header class="page-header">
        <h1>Explosives Ledger</h1>
        <button class="btn-primary" (click)="showAddReceipt()">+ Add Receipt</button>
      </header>

      <!-- Filter bar -->
      <div class="filter-bar">
        <select [(ngModel)]="filterProductType" (change)="applyFilters()">
          <option value="">All Products</option>
          <option value="ANFO">ANFO</option>
          <option value="EMULSION">Emulsion</option>
          <option value="DETONATEUR">Détonateur</option>
          <option value="CORDEAU">Cordeau</option>
        </select>
        <select [(ngModel)]="filterEventType" (change)="applyFilters()">
          <option value="">All Events</option>
          <option value="EXPLOSIVES_IN">Receipt</option>
          <option value="EXPLOSIVES_OUT_LOAD">Load Out</option>
          <option value="EXPLOSIVES_RETURN">Return</option>
          <option value="EXPLOSIVES_DESTROY">Destroy</option>
        </select>
      </div>

      <!-- Ledger table (AG Grid in production) -->
      <div class="grid-container">
        @if (loading) {
          <div class="loading">Loading ledger…</div>
        } @else if (events.length === 0) {
          <div class="empty-state">No explosives events recorded.</div>
        } @else {
          <table class="data-table">
            <thead>
              <tr>
                <th>Date/Time</th>
                <th>Event</th>
                <th>Product</th>
                <th>Qty (g)</th>
                <th>Doc Reference</th>
                <th>PDF</th>
              </tr>
            </thead>
            <tbody>
              @for (evt of events; track evt.id) {
                <tr>
                  <td>{{ evt.occurredAtUtc | date:'short' }}</td>
                  <td>
                    <span class="badge badge-{{ evt.eventType | lowercase }}">
                      {{ evt.eventType }}
                    </span>
                  </td>
                  <td>{{ evt.productType }}</td>
                  <td [class.negative]="isNegative(evt.quantityG)">
                    {{ evt.quantityG }}
                  </td>
                  <td>{{ evt.docReference ?? '—' }}</td>
                  <td>
                    @if (evt.pdfSha256) {
                      <a [href]="getPdfUrl(evt)" target="_blank">View PDF</a>
                    } @else {
                      <span class="generating">Generating…</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    </div>
  `,
})
export class ExplosivesLedgerComponent implements OnInit {
  events: ExplosivesEventRow[] = [];
  loading = false;
  filterProductType = '';
  filterEventType = '';

  constructor(private readonly tirApi: TirApiService) {}

  ngOnInit(): void {
    // In production: load from API with tenant/site from auth context
    this.loading = false;
    this.events = [];
  }

  showAddReceipt(): void {
    // Opens Formly form for EXPLOSIVES_IN event
    // TIR_SUPERVISOR or HR_MANAGER CASL guard applied on route
    console.log('[ExplosivesLedger] Add Receipt clicked');
  }

  applyFilters(): void {
    // Re-fetches filtered data from API
  }

  isNegative(quantityG: string): boolean {
    return parseInt(quantityG, 10) < 0;
  }

  getPdfUrl(evt: ExplosivesEventRow): string {
    return `/api/explosives-ledger/${evt.id}/pdf`;
  }
}
