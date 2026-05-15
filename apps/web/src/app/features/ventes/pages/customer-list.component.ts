import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef } from 'ag-grid-community';
import { Customer, VentesApiService } from '../services/ventes-api.service';

/** VTE-01 — Customer CRM list. */
@Component({
  selector: 'gravel-customer-list',
  standalone: true,
  imports: [CommonModule, TranslocoModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>{{ 'ventes.customer.title' | transloco }}</h2>
    <ag-grid-angular
      class="ag-theme-material"
      style="height: 480px;"
      [rowData]="rows()"
      [columnDefs]="columnDefs"
    />
  `,
})
export class CustomerListComponent implements OnInit {
  private readonly api = inject(VentesApiService);
  private readonly snack = inject(MatSnackBar);

  readonly rows = signal<Customer[]>([]);

  readonly columnDefs: ColDef<any>[] = [
    { field: 'code', headerName: 'Code', width: 120 },
    { field: 'name', headerName: 'Nom', flex: 2 },
    { field: 'defaultCurrency', headerName: 'Devise', width: 100 },
    { field: 'paymentTermsDays', headerName: 'Délai paiement', width: 140 },
    { field: 'isActive', headerName: 'Actif', width: 90 },
  ];

  ngOnInit(): void {
    this.api.listCustomers().subscribe({
      next: (rs) => this.rows.set(rs),
      error: (err: Error) =>
        this.snack.open(`Error: ${err.message}`, 'OK', { duration: 5000 }),
    });
  }
}
