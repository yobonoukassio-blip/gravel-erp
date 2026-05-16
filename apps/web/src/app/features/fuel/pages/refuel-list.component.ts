import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef, ValueFormatterParams, ValueGetterParams } from 'ag-grid-community';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HttpClient } from '@angular/common/http';
import { renderPill } from '../../../shared/ag-grid/status-pill';

export interface RefuelListRow {
  id: string;
  equipment_id: string;
  equipment_code?: string;
  liters: number;
  hours_since_previous: number | null;
  ratio_lh: number | null;
  anomaly_flag: boolean;
  created_at_utc: string;
}

/** CAR-02 / CAR-03 — Refuel list with L/h ratio and anomaly pill. */
@Component({
  selector: 'gravel-refuel-list',
  standalone: true,
  imports: [CommonModule, TranslocoModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page gv-anim-fade">
      <header class="page-head">
        <div class="page-head-text">
          <span class="page-eyebrow">OPÉRATIONS · CAR-02..03</span>
          <h1 class="page-title">{{ 'fuel.refuels.title' | transloco }}</h1>
          <p class="page-sub">Ravitaillements engins avec ratio L/h et détection d'anomalies</p>
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
  styles: [
    `
      :host { display: block; }
      .page { display: flex; flex-direction: column; gap: var(--gv-space-5); }
      .page-head {
        position: relative;
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
export class RefuelListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);

  readonly rows = signal<RefuelListRow[]>([]);

  readonly defaultColDef: ColDef = {
    sortable: true,
    resizable: true,
    filter: true,
  };

  readonly columnDefs: ColDef[] = [
    {
      field: 'equipmentCode',
      headerName: 'Engin',
      width: 160,
      cellStyle: { fontFamily: 'var(--gv-font-mono)', fontSize: '12px', fontWeight: '600' },
    },
    {
      field: 'liters',
      headerName: 'Litres',
      width: 120,
      type: 'rightAligned',
      valueFormatter: (p: ValueFormatterParams) =>
        p.value != null ? new Intl.NumberFormat('fr-FR').format(Number(p.value)) : '—',
      cellStyle: { fontVariantNumeric: 'tabular-nums', fontWeight: '600' },
    },
    {
      field: 'hoursSincePrevious',
      headerName: 'Heures depuis prev.',
      width: 180,
      type: 'rightAligned',
      valueFormatter: (p: ValueFormatterParams) =>
        p.value == null ? '—' : `${Number(p.value).toFixed(1)} h`,
      cellStyle: { fontVariantNumeric: 'tabular-nums', color: 'var(--gv-text-muted)' },
    },
    {
      colId: 'ratio_lh',
      headerName: 'Ratio L/h',
      width: 130,
      type: 'rightAligned',
      valueGetter: (p: ValueGetterParams<RefuelListRow>) => {
        const row = p.data;
        if (!row || !row.hours_since_previous) return null;
        return Math.round((row.liters / row.hours_since_previous) * 100) / 100;
      },
      valueFormatter: (p: ValueFormatterParams) =>
        p.value == null ? '—' : Number(p.value).toFixed(2),
      cellStyle: { fontVariantNumeric: 'tabular-nums' },
    },
    {
      field: 'anomalyFlag',
      headerName: 'Anomalie',
      width: 140,
      cellRenderer: (p: { value: boolean }) =>
        p.value ? renderPill('⚠ Anomalie', 'danger') : renderPill('OK', 'success'),
    },
    {
      field: 'createdAtUtc',
      headerName: 'Date',
      width: 180,
      valueFormatter: (p: ValueFormatterParams) =>
        p.value ? new Date(p.value as string).toLocaleString('fr-CI') : '—',
      cellStyle: { fontVariantNumeric: 'tabular-nums', fontSize: '12px' },
    },
  ];

  ngOnInit(): void {
    this.http.get<RefuelListRow[]>('/api/equipment-refuels').subscribe({
      next: (rs) => this.rows.set(rs),
      error: (err: Error) =>
        this.snack.open(`Erreur : ${err.message}`, 'OK', { duration: 5000 }),
    });
  }
}
