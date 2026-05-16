import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef } from 'ag-grid-community';
import { StockpileApiService, StockpileEventRow } from '../services/stockpile-api.service';

/** STK-01 — Append-only event ledger. Displays chain_hash for auditability. */
@Component({
  selector: 'gravel-stockpile-events',
  standalone: true,
  imports: [CommonModule, TranslocoModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>{{ 'stockpile.events.title' | transloco }}</h2>
    <ag-grid-angular
      class="ag-theme-material"
      style="height: 520px;"
      [rowData]="rows()"
      [columnDefs]="columnDefs"
      [pagination]="true"
      [paginationPageSize]="50"
    />
  `,
})
export class StockpileEventsComponent implements OnInit {
  private readonly api = inject(StockpileApiService);
  private readonly snack = inject(MatSnackBar);

  readonly rows = signal<StockpileEventRow[]>([]);

  readonly columnDefs: ColDef[] = [
    { field: 'occurredAtUtc', headerName: 'Date', width: 180 },
    { field: 'eventType', headerName: 'Type', width: 180 },
    { field: 'calibreCode', headerName: 'Calibre', width: 120 },
    { field: 'tonnageDeltaKg', headerName: 'Delta Kg', width: 140 },
    { field: 'chainHash', headerName: 'Hash', flex: 1 },
  ];

  ngOnInit(): void {
    this.api.listEvents('').subscribe({
      next: (rs) => this.rows.set(rs),
      error: (err) => this.snack.open(`Error: ${(err as Error).message}`, 'OK', { duration: 5000 }),
    });
  }
}
