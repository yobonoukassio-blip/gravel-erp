import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef } from 'ag-grid-community';
import { BonDeLivraison, VentesApiService } from '../services/ventes-api.service';

/** VTE-03 — BL list with status badges and content hash visible. */
@Component({
  selector: 'gravel-bl-list',
  standalone: true,
  imports: [CommonModule, TranslocoModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>{{ 'ventes.bl.title' | transloco }}</h2>
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
export class BlListComponent implements OnInit {
  private readonly api = inject(VentesApiService);
  private readonly snack = inject(MatSnackBar);

  readonly rows = signal<BonDeLivraison[]>([]);

  readonly columnDefs: ColDef<BonDeLivraison>[] = [
    { field: 'number', headerName: 'ventes.bl.columns.number', width: 180 },
    { field: 'customerId', headerName: 'ventes.bl.columns.customer', width: 160 },
    { field: 'calibreCode', headerName: 'ventes.bl.columns.calibre', width: 120 },
    { field: 'tonnageKg', headerName: 'ventes.bl.columns.tonnage_kg', width: 140 },
    { field: 'deliveryDate', headerName: 'ventes.bl.columns.delivery_date', width: 140 },
    {
      field: 'status',
      headerName: 'ventes.bl.columns.status',
      width: 130,
      cellRenderer: (p: { value: string }) =>
        `<span class="badge badge-${p.value}">${p.value}</span>`,
    },
    {
      field: 'contentSha256',
      headerName: 'ventes.bl.columns.content_hash',
      flex: 1,
      valueFormatter: (p) => (p.value ? `${String(p.value).slice(0, 16)}…` : ''),
    },
  ];

  ngOnInit(): void {
    this.api.listBLs().subscribe({
      next: (rs) => this.rows.set(rs),
      error: (err: Error) =>
        this.snack.open(`Error: ${err.message}`, 'OK', { duration: 5000 }),
    });
  }
}
