import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef } from 'ag-grid-community';
import { Invoice, VentesApiService } from '../services/ventes-api.service';

/** VTE-04 — Invoice list with FX rate + multi-currency totals. */
@Component({
  selector: 'gravel-invoice-list',
  standalone: true,
  imports: [CommonModule, TranslocoModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>{{ 'ventes.invoice.title' | transloco }}</h2>
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
export class InvoiceListComponent implements OnInit {
  private readonly api = inject(VentesApiService);
  private readonly snack = inject(MatSnackBar);

  readonly rows = signal<Invoice[]>([]);

  readonly columnDefs: ColDef<Invoice>[] = [
    { field: 'number', headerName: 'ventes.invoice.columns.number', width: 180 },
    { field: 'customerId', headerName: 'ventes.invoice.columns.customer', width: 160 },
    { field: 'issueDate', headerName: 'ventes.invoice.columns.date', width: 140 },
    { field: 'totalMinorUnits', headerName: 'ventes.invoice.columns.total', width: 160 },
    { field: 'currency', headerName: 'ventes.invoice.columns.currency', width: 100 },
    { field: 'fxRateToXof', headerName: 'ventes.invoice.columns.fx_to_xof', width: 130 },
    { field: 'totalXofMinorUnits', headerName: 'ventes.invoice.columns.total_xof', width: 160 },
    {
      field: 'status',
      headerName: 'ventes.invoice.columns.status',
      width: 110,
      cellRenderer: (p: { value: string }) =>
        `<span class="badge badge-${p.value}">${p.value}</span>`,
    },
  ];

  ngOnInit(): void {
    this.api.listInvoices().subscribe({
      next: (rs) => this.rows.set(rs),
      error: (err: Error) =>
        this.snack.open(`Error: ${err.message}`, 'OK', { duration: 5000 }),
    });
  }
}
