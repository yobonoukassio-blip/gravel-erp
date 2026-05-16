import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef, ValueFormatterParams } from 'ag-grid-community';
import { statusPillRenderer } from '../../../shared/ag-grid/status-pill';
import { Invoice, VentesApiService } from '../services/ventes-api.service';

/** VTE-04 — Invoice list with FX rate + multi-currency totals. */
@Component({
  selector: 'gravel-invoice-list',
  standalone: true,
  imports: [CommonModule, TranslocoModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page gv-anim-fade">
      <header class="page-head">
        <div class="page-head-text">
          <span class="page-eyebrow">COMMERCIAL · VTE-04</span>
          <h1 class="page-title">{{ 'ventes.invoice.title' | transloco }}</h1>
          <p class="page-sub">Factures multi-devises avec FX figé par snapshot</p>
        </div>
        <div class="page-stats">
          <span class="stat-item">
            <span class="stat-num gv-num">{{ rows().length }}</span>
            <span class="stat-label">factures</span>
          </span>
          <span class="stat-sep"></span>
          <span class="stat-item">
            <span class="stat-num stat-num--accent gv-num">{{ pendingCount() }}</span>
            <span class="stat-label">en attente</span>
          </span>
        </div>
      </header>

      <section class="grid-card">
        <ag-grid-angular
          class="ag-theme-quartz"
          style="height: 540px;"
          [rowData]="rows()"
          [columnDefs]="columnDefs"
          [defaultColDef]="defaultColDef"
          [animateRows]="true"
          [pagination]="true"
          [paginationPageSize]="50"
        />
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
      background: radial-gradient(circle, oklch(78% 0.16 85 / 0.26) 0%, transparent 60%);
      pointer-events: none;
    }
    .page-head-text { position: relative; z-index: 1; display: flex; flex-direction: column; gap: var(--gv-space-1); }
    .page-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.16em; color: var(--gv-gold); }
    .page-title { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; margin: 0; color: oklch(98% 0.005 250); }
    .page-sub { font-size: 13px; color: oklch(82% 0.012 250); margin: 0; }

    .page-stats {
      position: relative; z-index: 1;
      display: inline-flex; align-items: center; gap: var(--gv-space-4);
      padding: var(--gv-space-3) var(--gv-space-4);
      background: oklch(100% 0 0 / 0.08);
      border: 1px solid oklch(100% 0 0 / 0.14);
      border-radius: var(--gv-radius);
      backdrop-filter: blur(8px);
    }
    .stat-item { display: flex; flex-direction: column; line-height: 1; }
    .stat-num { font-size: 22px; font-weight: 700; color: oklch(98% 0.005 250); letter-spacing: -0.02em; }
    .stat-num--accent { color: var(--gv-gold-bright); }
    .stat-label { font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: oklch(78% 0.012 250); margin-top: 4px; }
    .stat-sep { width: 1px; height: 28px; background: oklch(100% 0 0 / 0.16); }

    .grid-card {
      background: var(--gv-surface);
      border: 1px solid var(--gv-border);
      border-radius: var(--gv-radius-md);
      box-shadow: var(--gv-shadow-1);
      overflow: hidden;
    }
    .grid-card ag-grid-angular { --ag-wrapper-border-radius: 0; }
  `],
})
export class InvoiceListComponent implements OnInit {
  private readonly api = inject(VentesApiService);
  private readonly snack = inject(MatSnackBar);

  readonly rows = signal<Invoice[]>([]);

  readonly pendingCount = computed(() =>
    this.rows().filter((r) => r.status === 'pending' || r.status === 'draft').length,
  );

  readonly defaultColDef: ColDef = {
    sortable: true,
    resizable: true,
    filter: true,
  };

  readonly columnDefs: ColDef[] = [
    {
      field: 'number',
      headerName: 'N° facture',
      width: 200,
      cellStyle: { fontFamily: 'var(--gv-font-mono)', fontSize: '12px', fontWeight: '600' },
    },
    {
      field: 'customerId',
      headerName: 'Client',
      width: 180,
      valueFormatter: (p: ValueFormatterParams) =>
        p.value ? `${String(p.value).slice(0, 8)}…` : '—',
      cellStyle: { fontFamily: 'var(--gv-font-mono)', fontSize: '12px', color: 'var(--gv-text-muted)' },
    },
    {
      field: 'issueDate',
      headerName: 'Émise le',
      width: 140,
      valueFormatter: (p: ValueFormatterParams) =>
        p.value ? new Date(p.value as string).toLocaleDateString('fr-CI') : '—',
      cellStyle: { fontVariantNumeric: 'tabular-nums' },
    },
    {
      field: 'totalMinorUnits',
      headerName: 'Total',
      width: 160,
      type: 'rightAligned',
      valueFormatter: (p: ValueFormatterParams) =>
        p.value != null ? new Intl.NumberFormat('fr-FR').format(Number(p.value)) : '—',
      cellStyle: { fontVariantNumeric: 'tabular-nums', fontWeight: '600' },
    },
    {
      field: 'currency',
      headerName: 'Devise',
      width: 110,
      cellStyle: { fontFamily: 'var(--gv-font-mono)', fontSize: '12px', fontWeight: '600' },
    },
    {
      field: 'fxRateToXof',
      headerName: 'FX → XOF',
      width: 140,
      type: 'rightAligned',
      valueFormatter: (p: ValueFormatterParams) =>
        p.value != null ? Number(p.value).toFixed(4) : '—',
      cellStyle: { fontVariantNumeric: 'tabular-nums', color: 'var(--gv-text-muted)', fontSize: '12px' },
    },
    {
      field: 'totalXofMinorUnits',
      headerName: 'Total XOF',
      width: 160,
      type: 'rightAligned',
      valueFormatter: (p: ValueFormatterParams) =>
        p.value != null ? new Intl.NumberFormat('fr-FR').format(Number(p.value)) : '—',
      cellStyle: { fontVariantNumeric: 'tabular-nums', fontWeight: '700', color: 'var(--gv-gold-deep)' },
    },
    {
      field: 'status',
      headerName: 'Statut',
      width: 150,
      cellRenderer: statusPillRenderer<string>({
        draft: { tone: 'neutral', label: 'Brouillon' },
        pending: { tone: 'warning', label: 'En attente' },
        paid: { tone: 'success', label: 'Payée' },
        overdue: { tone: 'danger', label: 'Échue' },
        cancelled: { tone: 'neutral', label: 'Annulée' },
      }),
    },
  ];

  ngOnInit(): void {
    this.api.listInvoices().subscribe({
      next: (rs) => this.rows.set(rs),
      error: (err: Error) =>
        this.snack.open(`Erreur : ${err.message}`, 'OK', { duration: 5000 }),
    });
  }
}
