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

  readonly columnDefs: ColDef<any>[] = [
    { field: 'stockpileId', headerName: 'Stockpile', flex: 1 },
    { field: 'calibreCode', headerName: 'Calibre', width: 120 },
    { field: 'minTonnageKg', headerName: 'Min Kg', width: 140 },
    { field: 'maxTonnageKg', headerName: 'Max Kg', width: 140 },
    { field: 'isActive', headerName: 'Actif', width: 90 },
  ];

  ngOnInit(): void {
    this.api.listThresholds('current').subscribe({
      next: (rs) => this.rows.set(rs),
      error: (err) => this.snack.open(`Error: ${(err as Error).message}`, 'OK', { duration: 5000 }),
    });
  }
}
