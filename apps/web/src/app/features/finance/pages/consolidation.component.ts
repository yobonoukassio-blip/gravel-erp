import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { TranslocoModule } from '@jsverse/transloco';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef, ValueFormatterParams } from 'ag-grid-community';
import { ConsolidatedPnL, FinanceApiService } from '../services/finance-api.service';

interface SiteLite {
  id: string;
  code: string;
  name: string;
}

interface SiteRow {
  siteId: string;
  revenueMinor: string;
  costMinor: string;
  marginMinor: string;
  tonnageT: number;
}

/** FIN-06 — Group consolidation (multi-site P&L in pivot currency). */
@Component({
  selector: 'gravel-consolidation',
  standalone: true,
  imports: [CommonModule, TranslocoModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>{{ 'finance.consolidation.title' | transloco }}</h2>
    @if (pnl(); as p) {
      <div class="kpis">
        <div class="kpi">
          <div class="label">Revenue ({{ p.pivotCurrency }})</div>
          <div class="value">{{ p.totalRevenueMinor }}</div>
        </div>
        <div class="kpi">
          <div class="label">Cost ({{ p.pivotCurrency }})</div>
          <div class="value">{{ p.totalCostMinor }}</div>
        </div>
        <div class="kpi margin">
          <div class="label">Margin</div>
          <div class="value">{{ p.totalMarginMinor }} ({{ p.marginPct }}%)</div>
        </div>
      </div>
    }
    <ag-grid-angular
      class="ag-theme-material"
      style="height: 400px;"
      [rowData]="rows()"
      [columnDefs]="columnDefs"
    />
  `,
  styles: [
    `
      .kpis {
        display: flex;
        gap: 16px;
        margin: 16px 0;
      }
      .kpi {
        flex: 1;
        background: #f5f5f5;
        padding: 16px;
        border-radius: 8px;
      }
      .kpi.margin {
        background: #e8f5e9;
      }
      .label {
        font-size: 0.75rem;
        color: #666;
      }
      .value {
        font-size: 1.25rem;
        font-weight: 500;
      }
    `,
  ],
})
export class ConsolidationComponent implements OnInit {
  private readonly api = inject(FinanceApiService);
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);

  readonly pnl = signal<ConsolidatedPnL | null>(null);
  readonly rows = signal<SiteRow[]>([]);
  private readonly siteNames = new Map<string, string>();

  readonly columnDefs: ColDef[] = [
    {
      field: 'siteId',
      headerName: 'Site',
      flex: 1,
      valueFormatter: (p: ValueFormatterParams<SiteRow, string>) => {
        const id = p.value ?? '';
        return this.siteNames.get(id) ?? id;
      },
    },
    { field: 'revenueMinor', headerName: 'Revenue', width: 160 },
    { field: 'costMinor', headerName: 'Cost', width: 160 },
    { field: 'marginMinor', headerName: 'Margin', width: 160 },
    { field: 'tonnageT', headerName: 'Tonnage T', width: 140 },
  ];

  ngOnInit(): void {
    // Load site name lookup so the grid shows "Carrière Mobaye" instead of UUID.
    this.http.get<{ data: SiteLite[] }>('/api/sites').subscribe({
      next: (resp) => {
        for (const s of resp.data ?? []) this.siteNames.set(s.id, s.name);
        // Force grid re-render of the rows we already loaded (if any).
        this.rows.set([...this.rows()]);
      },
      error: () => {
        /* Cosmetic — fall back to UUID display */
      },
    });

    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      .toISOString()
      .slice(0, 10);
    const to = now.toISOString().slice(0, 10);
    this.api.consolidate('XOF', from, to).subscribe({
      next: (p) => {
        this.pnl.set(p);
        this.rows.set(p.bySite);
      },
      error: (err: Error) =>
        this.snack.open(`Error: ${err.message}`, 'OK', { duration: 5000 }),
    });
  }
}
