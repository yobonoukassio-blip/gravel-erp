import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef } from 'ag-grid-community';
import { StockpileApiService, StockpileThreshold } from '../services/stockpile-api.service';

/** STK-02 — Threshold alert configuration view. */
@Component({
  selector: 'gravel-stockpile-thresholds',
  standalone: true,
  imports: [CommonModule, TranslocoModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>{{ 'stockpile.thresholds.title' | transloco }}</h2>
    <ag-grid-angular
      class="ag-theme-material"
      style="height: 400px;"
      [rowData]="rows()"
      [columnDefs]="columnDefs"
    />
  `,
})
export class StockpileThresholdsComponent implements OnInit {
  private readonly api = inject(StockpileApiService);
  private readonly snack = inject(MatSnackBar);

  readonly rows = signal<StockpileThreshold[]>([]);

  readonly columnDefs: ColDef<StockpileThreshold>[] = [
    { field: 'stockpile_id', headerName: 'stockpile.thresholds.columns.stockpile', flex: 1 },
    { field: 'calibre_code', headerName: 'stockpile.thresholds.columns.calibre', width: 120 },
    { field: 'min_tonnage_kg', headerName: 'stockpile.thresholds.columns.min_kg', width: 140 },
    { field: 'max_tonnage_kg', headerName: 'stockpile.thresholds.columns.max_kg', width: 140 },
    { field: 'is_active', headerName: 'stockpile.thresholds.columns.active', width: 90 },
  ];

  ngOnInit(): void {
    this.api.listThresholds('current').subscribe({
      next: (rs) => this.rows.set(rs),
      error: (err) => this.snack.open(`Error: ${(err as Error).message}`, 'OK', { duration: 5000 }),
    });
  }
}
