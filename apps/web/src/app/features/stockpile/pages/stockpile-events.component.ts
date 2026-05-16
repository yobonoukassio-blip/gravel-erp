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
import { statusPillRenderer } from '../../../shared/ag-grid/status-pill';
import { StockpileApiService, StockpileEventRow } from '../services/stockpile-api.service';

/** STK-01 — Append-only event ledger. Displays chain_hash for auditability. */
@Component({
  selector: 'gravel-stockpile-events',
  standalone: true,
  imports: [CommonModule, TranslocoModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page gv-anim-fade">
      <header class="page-head">
        <div class="page-head-text">
          <span class="page-eyebrow">PRODUCTION · STK-01</span>
          <h1 class="page-title">{{ 'stockpile.events.title' | transloco }}</h1>
          <p class="page-sub">Registre append-only event-sourced — chaque ligne verrouillée par chain_hash</p>
        </div>
        <span class="audit-pill">
          <span class="audit-dot"></span>
          IMMUABLE
        </span>
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

    .audit-pill {
      position: relative; z-index: 1;
      display: inline-flex;
      align-items: center;
      gap: var(--gv-space-2);
      padding: 6px var(--gv-space-3);
      background: var(--gv-navy-900);
      color: var(--gv-gold-bright);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.12em;
      border-radius: 999px;
      border: 1px solid var(--gv-gold);
      box-shadow: 0 2px 8px oklch(0% 0 0 / 0.3);
    }
    .audit-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: var(--gv-gold-bright);
      box-shadow: 0 0 8px var(--gv-gold);
    }

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
export class StockpileEventsComponent implements OnInit {
  private readonly api = inject(StockpileApiService);
  private readonly snack = inject(MatSnackBar);

  readonly rows = signal<StockpileEventRow[]>([]);

  readonly defaultColDef: ColDef = {
    sortable: true,
    resizable: true,
    filter: true,
  };

  readonly columnDefs: ColDef[] = [
    {
      field: 'occurredAtUtc',
      headerName: 'Date',
      width: 180,
      valueFormatter: (p: ValueFormatterParams) =>
        p.value ? new Date(p.value as string).toLocaleString('fr-CI') : '—',
      cellStyle: { fontVariantNumeric: 'tabular-nums', fontSize: '12px' },
    },
    {
      field: 'eventType',
      headerName: 'Type',
      width: 200,
      cellRenderer: statusPillRenderer<string>({
        STOCKPILE_INFLOW: { tone: 'success', label: 'Entrée' },
        STOCKPILE_INFLOW_CRUSHER: { tone: 'success', label: 'Entrée concasseur' },
        STOCKPILE_INFLOW_SCREENING: { tone: 'success', label: 'Entrée criblage' },
        STOCKPILE_OUTFLOW_SALE: { tone: 'warning', label: 'Sortie vente' },
        STOCKPILE_ADJUSTMENT: { tone: 'info', label: 'Ajustement' },
      }),
    },
    {
      field: 'calibreCode',
      headerName: 'Calibre',
      width: 130,
      cellStyle: { fontFamily: 'var(--gv-font-mono)', fontSize: '12px', fontWeight: '600' },
    },
    {
      field: 'tonnageDeltaKg',
      headerName: 'Delta (kg)',
      width: 160,
      type: 'rightAligned',
      valueFormatter: (p: ValueFormatterParams) =>
        p.value != null ? new Intl.NumberFormat('fr-FR').format(Number(p.value)) : '—',
      cellStyle: (p) => {
        const v = Number(p.value);
        if (!Number.isFinite(v)) return { fontVariantNumeric: 'tabular-nums' };
        return {
          fontVariantNumeric: 'tabular-nums',
          fontWeight: '600',
          color: v >= 0 ? 'oklch(38% 0.14 152)' : 'oklch(42% 0.19 25)',
        };
      },
    },
    {
      field: 'chainHash',
      headerName: 'Chain hash',
      flex: 1,
      minWidth: 240,
      valueFormatter: (p: ValueFormatterParams) =>
        typeof p.value === 'string' ? `${p.value.slice(0, 24)}…` : '—',
      cellStyle: { fontFamily: 'var(--gv-font-mono)', fontSize: '11px', color: 'var(--gv-text-muted)' },
    },
  ];

  ngOnInit(): void {
    this.api.listEvents('').subscribe({
      next: (rs) => this.rows.set(rs),
      error: (err) =>
        this.snack.open(`Erreur : ${(err as Error).message}`, 'OK', { duration: 5000 }),
    });
  }
}
