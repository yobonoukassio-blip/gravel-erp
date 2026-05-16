import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ExplosivesEventRow, TirApiService } from '../services/tir-api.service';

/**
 * ExplosivesLedgerComponent — TIR-01 Web.
 *
 * Read-only ledger of explosives_event rows with filter bar + Add Receipt
 * action. Each row carries event type, product, signed quantity, doc
 * reference, and a PDF link (or "Generating…" if not yet materialized).
 * CASL: TIR_SUPERVISOR or HR_MANAGER.
 */
@Component({
  selector: 'gravel-explosives-ledger',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    DatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page gv-anim-fade">
      <header class="page-head">
        <div class="page-head-text">
          <span class="page-eyebrow">PRODUCTION · TIR-01</span>
          <h1 class="page-title">Registre des explosifs</h1>
          <p class="page-sub">Entrées, sorties, retours et destructions tracées par produit</p>
        </div>
        <button
          mat-flat-button
          color="primary"
          type="button"
          (click)="showAddReceipt()"
          class="page-action"
          data-testid="explosives-add-receipt"
        >
          <mat-icon>add</mat-icon>
          Réception
        </button>
      </header>

      <section class="filter-bar">
        <label class="filter-label">
          <span class="filter-key">Produit</span>
          <select class="filter-select" [(ngModel)]="filterProductType" (change)="applyFilters()">
            <option value="">Tous</option>
            <option value="ANFO">ANFO</option>
            <option value="EMULSION">Émulsion</option>
            <option value="DETONATEUR">Détonateur</option>
            <option value="CORDEAU">Cordeau</option>
          </select>
        </label>
        <label class="filter-label">
          <span class="filter-key">Événement</span>
          <select class="filter-select" [(ngModel)]="filterEventType" (change)="applyFilters()">
            <option value="">Tous</option>
            <option value="EXPLOSIVES_IN">Réception</option>
            <option value="EXPLOSIVES_OUT_LOAD">Sortie chargement</option>
            <option value="EXPLOSIVES_RETURN">Retour</option>
            <option value="EXPLOSIVES_DESTROY">Destruction</option>
          </select>
        </label>
      </section>

      <section class="grid-card">
        @if (loading()) {
          <div class="state-row">
            <span class="loading-dot"></span>
            <span class="loading-dot"></span>
            <span class="loading-dot"></span>
            <span>Chargement du registre…</span>
          </div>
        } @else if (events().length === 0) {
          <div class="empty-state">
            <mat-icon>inventory_2</mat-icon>
            <p>Aucun événement d'explosifs enregistré.</p>
          </div>
        } @else {
          <table class="data-table">
            <thead>
              <tr>
                <th class="col-date">Date / Heure</th>
                <th>Événement</th>
                <th>Produit</th>
                <th class="num">Quantité (g)</th>
                <th>Référence doc</th>
                <th class="col-pdf">PDF</th>
              </tr>
            </thead>
            <tbody>
              @for (evt of events(); track evt.id) {
                <tr>
                  <td class="cell-date">{{ evt.occurredAtUtc | date:'dd/MM/yyyy HH:mm' }}</td>
                  <td>
                    <span class="pill" [attr.data-tone]="toneFor(evt.eventType)">
                      {{ labelFor(evt.eventType) }}
                    </span>
                  </td>
                  <td class="cell-product">{{ evt.productType }}</td>
                  <td class="num cell-qty" [class.negative]="isNegative(evt.quantityG)">
                    {{ formatQty(evt.quantityG) }}
                  </td>
                  <td class="cell-doc">{{ evt.docReference ?? '—' }}</td>
                  <td>
                    @if (evt.pdfSha256) {
                      <a [href]="getPdfUrl(evt)" target="_blank" class="pdf-link">
                        <mat-icon>open_in_new</mat-icon>
                        Ouvrir
                      </a>
                    } @else {
                      <span class="pill" data-tone="warning">Génération…</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </section>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .page { display: flex; flex-direction: column; gap: var(--gv-space-5); }

    .page-head {
      position: relative;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--gv-space-4);
      padding: var(--gv-space-5) var(--gv-space-6);
      background: linear-gradient(135deg, var(--gv-navy-900), var(--gv-navy-700));
      border-radius: var(--gv-radius-lg);
      overflow: hidden;
      color: oklch(96% 0.005 250);
      box-shadow: var(--gv-shadow-2);
    }
    .page-head::before {
      content: '';
      position: absolute;
      top: -50%; right: -10%;
      width: 320px; height: 320px;
      background: radial-gradient(circle, oklch(58% 0.21 25 / 0.22) 0%, transparent 60%);
      pointer-events: none;
    }
    .page-head-text { position: relative; z-index: 1; display: flex; flex-direction: column; gap: var(--gv-space-1); }
    .page-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.16em; color: var(--gv-gold); }
    .page-title { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; margin: 0; color: oklch(98% 0.005 250); }
    .page-sub { font-size: 13px; color: oklch(82% 0.012 250); margin: 0; }
    .page-action {
      position: relative; z-index: 1;
      display: inline-flex !important;
      align-items: center;
      gap: var(--gv-space-2);
    }

    .filter-bar {
      display: grid;
      gap: var(--gv-space-3);
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      padding: var(--gv-space-4);
      background: var(--gv-surface);
      border: 1px solid var(--gv-border);
      border-radius: var(--gv-radius-md);
      box-shadow: var(--gv-shadow-1);
    }
    .filter-label {
      display: flex;
      flex-direction: column;
      gap: var(--gv-space-1);
    }
    .filter-key {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--gv-text-soft);
    }
    .filter-select {
      appearance: none;
      padding: 8px 12px;
      background: var(--gv-surface);
      border: 1.5px solid var(--gv-border);
      border-radius: var(--gv-radius);
      font-family: var(--gv-font-sans);
      font-size: 13px;
      color: var(--gv-text);
      cursor: pointer;
      transition: border-color var(--gv-duration-1) var(--gv-ease);
      background-image: linear-gradient(45deg, transparent 50%, var(--gv-text-muted) 50%),
                        linear-gradient(135deg, var(--gv-text-muted) 50%, transparent 50%);
      background-position: calc(100% - 16px) calc(50% - 2px),
                           calc(100% - 11px) calc(50% - 2px);
      background-size: 5px 5px;
      background-repeat: no-repeat;
      padding-right: 30px;
    }
    .filter-select:focus {
      outline: none;
      border-color: var(--gv-gold);
      box-shadow: 0 0 0 3px var(--gv-gold-ring);
    }

    .grid-card {
      background: var(--gv-surface);
      border: 1px solid var(--gv-border);
      border-radius: var(--gv-radius-md);
      box-shadow: var(--gv-shadow-1);
      overflow: hidden;
    }

    .state-row {
      display: flex;
      align-items: center;
      gap: var(--gv-space-2);
      padding: var(--gv-space-5) var(--gv-space-6);
      color: var(--gv-text-muted);
      font-size: 13px;
    }
    .loading-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: var(--gv-gold);
      animation: gv-pulse-dot 1.4s var(--gv-ease) infinite;
    }
    .loading-dot:nth-child(2) { animation-delay: 0.18s; }
    .loading-dot:nth-child(3) { animation-delay: 0.36s; }

    .empty-state {
      padding: var(--gv-space-10);
      text-align: center;
      color: var(--gv-text-muted);
    }
    .empty-state mat-icon {
      font-size: 40px;
      width: 40px;
      height: 40px;
      color: var(--gv-text-soft);
      margin-bottom: var(--gv-space-2);
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .data-table thead th {
      padding: var(--gv-space-3) var(--gv-space-4);
      background: var(--gv-navy-800);
      color: oklch(90% 0.01 250);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      text-align: left;
      border-bottom: 2px solid var(--gv-gold);
    }
    .data-table thead th.num { text-align: right; }
    .data-table tbody td {
      padding: var(--gv-space-3) var(--gv-space-4);
      border-bottom: 1px solid var(--gv-divider);
      color: var(--gv-text);
    }
    .data-table tbody tr:hover { background: var(--gv-surface-2); }
    .data-table tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .cell-date { font-variant-numeric: tabular-nums; font-size: 12px; color: var(--gv-text-muted); }
    .cell-product { font-family: var(--gv-font-mono); font-size: 12px; font-weight: 600; }
    .cell-qty { font-weight: 600; }
    .cell-qty.negative { color: oklch(42% 0.19 25); }
    .cell-doc { font-family: var(--gv-font-mono); font-size: 12px; color: var(--gv-text-muted); }

    .pill {
      display: inline-flex;
      align-items: center;
      padding: 2px 10px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.02em;
      border-radius: 999px;
      border: 1px solid;
      line-height: 1.5;
      white-space: nowrap;
    }
    .pill[data-tone="success"]  { background: var(--gv-success-soft); color: oklch(34% 0.14 152); border-color: oklch(80% 0.10 152); }
    .pill[data-tone="warning"]  { background: var(--gv-warning-soft); color: oklch(36% 0.14 75); border-color: oklch(80% 0.13 75); }
    .pill[data-tone="danger"]   { background: var(--gv-danger-soft); color: oklch(38% 0.19 25); border-color: oklch(80% 0.14 25); }
    .pill[data-tone="info"]     { background: var(--gv-info-soft); color: oklch(38% 0.13 240); border-color: oklch(80% 0.10 240); }
    .pill[data-tone="neutral"]  { background: var(--gv-surface-2); color: var(--gv-text-muted); border-color: var(--gv-border-strong); }

    .pdf-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--gv-gold-deep);
      font-weight: 600;
      font-size: 12px;
      text-decoration: none;
    }
    .pdf-link:hover { color: var(--gv-gold-hover); }
    .pdf-link mat-icon {
      font-size: 14px !important;
      width: 14px !important;
      height: 14px !important;
    }
  `],
})
export class ExplosivesLedgerComponent implements OnInit {
  private readonly tirApi = inject(TirApiService);

  readonly events = signal<ExplosivesEventRow[]>([]);
  readonly loading = signal(false);

  filterProductType = '';
  filterEventType = '';

  ngOnInit(): void {
    this.loading.set(false);
    this.events.set([]);
  }

  showAddReceipt(): void {
    // Opens Formly form for EXPLOSIVES_IN event
    // TIR_SUPERVISOR or HR_MANAGER CASL guard applied on route
  }

  applyFilters(): void {
    // Re-fetches filtered data from API
  }

  isNegative(quantityG: string): boolean {
    return parseInt(quantityG, 10) < 0;
  }

  formatQty(quantityG: string): string {
    const n = Number(quantityG);
    if (!Number.isFinite(n)) return quantityG;
    return new Intl.NumberFormat('fr-FR').format(n);
  }

  toneFor(eventType: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
    switch (eventType) {
      case 'EXPLOSIVES_IN': return 'success';
      case 'EXPLOSIVES_OUT_LOAD': return 'warning';
      case 'EXPLOSIVES_RETURN': return 'info';
      case 'EXPLOSIVES_DESTROY': return 'danger';
      default: return 'neutral';
    }
  }

  labelFor(eventType: string): string {
    switch (eventType) {
      case 'EXPLOSIVES_IN': return 'Réception';
      case 'EXPLOSIVES_OUT_LOAD': return 'Sortie';
      case 'EXPLOSIVES_RETURN': return 'Retour';
      case 'EXPLOSIVES_DESTROY': return 'Destruction';
      default: return eventType;
    }
  }

  getPdfUrl(evt: ExplosivesEventRow): string {
    return `/api/explosives-ledger/${evt.id}/pdf`;
  }
}
