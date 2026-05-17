import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef, ValueFormatterParams, ValueGetterParams } from 'ag-grid-community';
import { HttpClient } from '@angular/common/http';
import { renderPill } from '../../../shared/ag-grid/status-pill';

export interface FuelTankRow {
  id: string;
  code: string;
  label: string;
  capacity_liters: number;
  balance_liters: number;
  fuel_type: string;
  last_reconciliation_drift?: number | null;
}

/** CAR-01 — Fuel tank list with live balance_liters and fill percentage. */
@Component({
  selector: 'gravel-fuel-tank-list',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslocoModule, MatButtonModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page gv-anim-fade">
      <header class="page-head">
        <div class="page-head-text">
          <span class="page-eyebrow">OPÉRATIONS · CAR-01</span>
          <h1 class="page-title">{{ 'fuel.tanks.title' | transloco }}</h1>
          <p class="page-sub">Cuves carburant avec solde temps réel et alertes seuil</p>
        </div>
        <a
          mat-flat-button
          color="primary"
          routerLink="./deliveries"
          class="page-action"
        >
          {{ 'fuel.tanks.add_delivery' | transloco }}
        </a>
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
          [paginationPageSize]="25"
        />
      </section>
    </div>
  `,
  styles: [
    `
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
      .page-action { position: relative; z-index: 1; }
      .grid-card {
        background: var(--gv-surface);
        border: 1px solid var(--gv-border);
        border-radius: var(--gv-radius-md);
        box-shadow: var(--gv-shadow-1);
        overflow: hidden;
      }
      .grid-card ag-grid-angular { --ag-wrapper-border-radius: 0; }
    `,
  ],
})
export class FuelTankListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);

  readonly rows = signal<FuelTankRow[]>([]);

  readonly defaultColDef: ColDef = {
    sortable: true,
    resizable: true,
    filter: true,
  };

  readonly columnDefs: ColDef[] = [
    {
      field: 'code',
      headerName: 'Code',
      width: 120,
      cellStyle: { fontFamily: 'var(--gv-font-mono)', fontSize: '12px', fontWeight: '600' },
    },
    { field: 'label', headerName: 'Libellé', flex: 2, minWidth: 200 },
    {
      field: 'capacityLiters',
      headerName: 'Capacité (L)',
      width: 140,
      type: 'rightAligned',
      valueFormatter: (p: ValueFormatterParams) =>
        p.value != null ? new Intl.NumberFormat('fr-FR').format(Number(p.value)) : '—',
      cellStyle: { fontVariantNumeric: 'tabular-nums', color: 'var(--gv-text-muted)' },
    },
    {
      field: 'balanceLiters',
      headerName: 'Solde (L)',
      width: 160,
      type: 'rightAligned',
      valueFormatter: (p: ValueFormatterParams) =>
        p.value != null ? new Intl.NumberFormat('fr-FR').format(Number(p.value)) : '—',
      cellStyle: { fontVariantNumeric: 'tabular-nums', fontWeight: '600' },
    },
    {
      colId: 'fill_pct',
      headerName: 'Niveau',
      width: 180,
      valueGetter: (p: ValueGetterParams<FuelTankRow>) => {
        const row = p.data;
        if (!row) return null;
        const cap = Number(row.capacity_liters);
        const bal = Number(row.balance_liters);
        if (!cap || !Number.isFinite(bal)) return null;
        return Math.round((bal / cap) * 100);
      },
      cellRenderer: (p: { value: number | null }) => {
        if (p.value == null) return '—';
        const pct = p.value;
        const tone = pct < 10 ? 'danger' : pct < 30 ? 'warning' : 'success';
        return renderPill(`${pct} %`, tone);
      },
    },
    {
      field: 'lastReconciliationDrift',
      headerName: 'Écart recon. (L)',
      width: 170,
      type: 'rightAligned',
      valueFormatter: (p: ValueFormatterParams) =>
        p.value == null ? '—' : `${Number(p.value).toFixed(1)}`,
      cellStyle: (p: { value: unknown }): Record<string, string> => {
        const v = p.value as number | null;
        if (v == null) return { fontVariantNumeric: 'tabular-nums', color: 'var(--gv-text-muted)', fontWeight: '400' };
        return {
          fontVariantNumeric: 'tabular-nums',
          fontWeight: '600',
          color: Math.abs(v) > 5 ? 'oklch(42% 0.19 25)' : 'var(--gv-text-muted)',
        };
      },
    },
    { field: 'fuelType', headerName: 'Type', width: 120 },
  ];

  ngOnInit(): void {
    this.http.get<FuelTankRow[]>('/api/fuel-tanks').subscribe({
      next: (rs) => this.rows.set(rs),
      error: (err: Error) =>
        this.snack.open(`Erreur : ${err.message}`, 'OK', { duration: 5000 }),
    });
  }
}
