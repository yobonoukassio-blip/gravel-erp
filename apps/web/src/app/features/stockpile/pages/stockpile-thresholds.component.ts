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
import { StockpileApiService, StockpileThreshold } from '../services/stockpile-api.service';

/** STK-02 — Threshold alert configuration view. */
@Component({
  selector: 'gravel-stockpile-thresholds',
  standalone: true,
  imports: [CommonModule, TranslocoModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page gv-anim-fade">
      <header class="page-head">
        <div class="page-head-text">
          <span class="page-eyebrow">PRODUCTION · STK-02</span>
          <h1 class="page-title">{{ 'stockpile.thresholds.title' | transloco }}</h1>
          <p class="page-sub">Seuils d'alerte min/max par stockpile et calibre</p>
        </div>
      </header>

      <section class="grid-card">
        <ag-grid-angular
          class="ag-theme-quartz"
          style="height: 420px;"
          [rowData]="rows()"
          [columnDefs]="columnDefs"
          [defaultColDef]="defaultColDef"
          [animateRows]="true"
        />
      </section>
    </div>
  `,
  styles: [`
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
  `],
})
export class StockpileThresholdsComponent implements OnInit {
  private readonly api = inject(StockpileApiService);
  private readonly snack = inject(MatSnackBar);

  readonly rows = signal<StockpileThreshold[]>([]);

  readonly defaultColDef: ColDef = {
    sortable: true,
    resizable: true,
    filter: true,
  };

  readonly columnDefs: ColDef[] = [
    {
      field: 'stockpileId',
      headerName: 'Stockpile',
      flex: 1,
      minWidth: 200,
      valueFormatter: (p: ValueFormatterParams) =>
        p.value ? `${String(p.value).slice(0, 8)}…` : '—',
      cellStyle: { fontFamily: 'var(--gv-font-mono)', fontSize: '12px' },
    },
    {
      field: 'calibreCode',
      headerName: 'Calibre',
      width: 130,
      cellStyle: { fontFamily: 'var(--gv-font-mono)', fontSize: '12px', fontWeight: '600' },
    },
    {
      field: 'minTonnageKg',
      headerName: 'Seuil min (t)',
      width: 160,
      type: 'rightAligned',
      valueFormatter: (p: ValueFormatterParams) =>
        p.value != null ? (Number(p.value) / 1000).toFixed(1) : '—',
      cellStyle: { fontVariantNumeric: 'tabular-nums', color: 'oklch(42% 0.19 25)', fontWeight: '600' },
    },
    {
      field: 'maxTonnageKg',
      headerName: 'Seuil max (t)',
      width: 160,
      type: 'rightAligned',
      valueFormatter: (p: ValueFormatterParams) =>
        p.value != null ? (Number(p.value) / 1000).toFixed(1) : '—',
      cellStyle: { fontVariantNumeric: 'tabular-nums', color: 'oklch(45% 0.16 75)', fontWeight: '600' },
    },
    {
      field: 'isActive',
      headerName: 'État',
      width: 130,
      cellRenderer: (p: { value: boolean }) =>
        p.value ? renderPill('Actif', 'success') : renderPill('Désactivé', 'neutral'),
    },
  ];

  ngOnInit(): void {
    this.api.listThresholds('current').subscribe({
      next: (rs) => this.rows.set(rs),
      error: (err) =>
        this.snack.open(`Erreur : ${(err as Error).message}`, 'OK', { duration: 5000 }),
    });
  }
}
