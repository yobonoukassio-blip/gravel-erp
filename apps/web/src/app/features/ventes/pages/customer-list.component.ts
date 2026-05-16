import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef, ValueFormatterParams } from 'ag-grid-community';
import { renderPill } from '../../../shared/ag-grid/status-pill';
import { Customer, VentesApiService } from '../services/ventes-api.service';

/** VTE-01 — Customer CRM list. */
@Component({
  selector: 'gravel-customer-list',
  standalone: true,
  imports: [CommonModule, TranslocoModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page gv-anim-fade">
      <header class="page-head">
        <div class="page-head-text">
          <span class="page-eyebrow">COMMERCIAL · VTE-01</span>
          <h1 class="page-title">{{ 'ventes.customer.title' | transloco }}</h1>
          <p class="page-sub">Clients avec contrats, devises et délais de paiement</p>
        </div>
        <div class="page-counter">
          <span class="counter-num gv-num">{{ rows().length }}</span>
          <span class="counter-label">clients</span>
        </div>
      </header>

      <section class="grid-card">
        <ag-grid-angular
          class="ag-theme-quartz"
          style="height: 500px;"
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
    .page-counter {
      position: relative; z-index: 1;
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      padding: var(--gv-space-3) var(--gv-space-5);
      background: oklch(100% 0 0 / 0.08);
      border: 1px solid oklch(100% 0 0 / 0.14);
      border-radius: var(--gv-radius);
      backdrop-filter: blur(8px);
    }
    .counter-num { font-size: 28px; font-weight: 700; color: var(--gv-gold-bright); letter-spacing: -0.025em; line-height: 1; }
    .counter-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: oklch(82% 0.012 250); }

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
export class CustomerListComponent implements OnInit {
  private readonly api = inject(VentesApiService);
  private readonly snack = inject(MatSnackBar);

  readonly rows = signal<Customer[]>([]);

  readonly defaultColDef: ColDef = {
    sortable: true,
    resizable: true,
    filter: true,
  };

  readonly columnDefs: ColDef[] = [
    {
      field: 'code',
      headerName: 'Code',
      width: 130,
      cellStyle: { fontFamily: 'var(--gv-font-mono)', fontSize: '12px', fontWeight: '600' },
    },
    { field: 'name', headerName: 'Nom', flex: 2, minWidth: 240 },
    {
      field: 'defaultCurrency',
      headerName: 'Devise',
      width: 110,
      cellStyle: { fontFamily: 'var(--gv-font-mono)', fontSize: '12px', fontWeight: '600' },
    },
    {
      field: 'paymentTermsDays',
      headerName: 'Délai paiement',
      width: 160,
      type: 'rightAligned',
      valueFormatter: (p: ValueFormatterParams) =>
        p.value != null ? `${p.value} jours` : '—',
      cellStyle: { fontVariantNumeric: 'tabular-nums' },
    },
    {
      field: 'isActive',
      headerName: 'État',
      width: 130,
      cellRenderer: (p: { value: boolean }) =>
        p.value ? renderPill('Actif', 'success') : renderPill('Inactif', 'neutral'),
    },
  ];

  ngOnInit(): void {
    this.api.listCustomers().subscribe({
      next: (rs) => this.rows.set(rs),
      error: (err: Error) =>
        this.snack.open(`Erreur : ${err.message}`, 'OK', { duration: 5000 }),
    });
  }
}
