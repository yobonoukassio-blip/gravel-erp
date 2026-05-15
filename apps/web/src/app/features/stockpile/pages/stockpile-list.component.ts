import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef } from 'ag-grid-community';
import { StockpileApiService, StockpileRow } from '../services/stockpile-api.service';

/** STK-01 — Stockpile master list with current balance per calibre. */
@Component({
  selector: 'gravel-stockpile-list',
  standalone: true,
  imports: [CommonModule, TranslocoModule, MatButtonModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <h2>{{ 'stockpile.title' | transloco }}</h2>
      <span class="provisional-label" data-testid="cost-provisional-label">
        {{ 'stockpile.cost_model_version_disclaimer' | transloco }}
        (Coût moyen pondéré v1 provisoire)
      </span>
    </div>
    <ag-grid-angular
      class="ag-theme-material"
      style="height: 480px;"
      [rowData]="rows()"
      [columnDefs]="columnDefs"
      [pagination]="true"
      [paginationPageSize]="25"
    />
  `,
  styles: [`.toolbar { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; }`],
})
export class StockpileListComponent implements OnInit {
  private readonly api = inject(StockpileApiService);
  private readonly snack = inject(MatSnackBar);

  readonly rows = signal<StockpileRow[]>([]);

  readonly columnDefs: ColDef<any>[] = [
    { field: 'name', headerName: 'Nom', flex: 2 },
    { field: 'materialType', headerName: 'Matériau', width: 140 },
    { field: 'calibreCode', headerName: 'Calibre', width: 140 },
    { field: 'isActive', headerName: 'Actif', width: 100 },
    {
      colId: 'weighted_avg_cost',
      headerName: 'Coût moyen pondéré',
      width: 200,
      valueGetter: (p) =>
        (p.data as StockpileRow & { weighted_avg_cost_per_ton_minor_units?: string })
          ?.weighted_avg_cost_per_ton_minor_units ?? '—',
    },
  ];

  ngOnInit(): void {
    this.api.listStockpiles('current').subscribe({
      next: (rs) => this.rows.set(rs),
      error: (err) => this.snack.open(`Error: ${(err as Error).message}`, 'OK', { duration: 5000 }),
    });
  }
}
