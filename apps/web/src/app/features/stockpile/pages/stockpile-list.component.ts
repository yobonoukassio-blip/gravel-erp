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

  readonly columnDefs: ColDef<StockpileRow>[] = [
    { field: 'name', headerName: 'stockpile.columns.name', flex: 2 },
    { field: 'material_type', headerName: 'stockpile.columns.material', width: 140 },
    { field: 'calibre_code', headerName: 'stockpile.columns.calibre', width: 140 },
    { field: 'is_active', headerName: 'stockpile.columns.active', width: 100 },
  ];

  ngOnInit(): void {
    this.api.listStockpiles('current').subscribe({
      next: (rs) => this.rows.set(rs),
      error: (err) => this.snack.open(`Error: ${(err as Error).message}`, 'OK', { duration: 5000 }),
    });
  }
}
