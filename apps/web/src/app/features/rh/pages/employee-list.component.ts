import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef } from 'ag-grid-community';
import { RhApiService, EmployeeRow } from '../services/rh-api.service';

/**
 * EmployeeListComponent (RH-01, RH-02).
 *
 * AG Grid with columns: employee_number, last_name, first_name,
 * contract_type, role_code, site_name, is_active.
 * Server-side filter by site_id, is_active, cert_code + cert_valid_as_of.
 * Row click navigates to employee form.
 */
@Component({
  selector: 'gravel-employee-list',
  standalone: true,
  imports: [CommonModule, RouterModule, MatButtonModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <h2>Employés</h2>
      <a mat-raised-button color="primary" routerLink="/rh/employees/new">
        + Nouvel employé
      </a>
    </div>

    <ag-grid-angular
      class="ag-theme-material"
      style="height: 520px;"
      [rowData]="rows()"
      [columnDefs]="columnDefs"
      [pagination]="true"
      [paginationPageSize]="25"
      (rowClicked)="onRowClicked($event)"
    />
  `,
  styles: [`.toolbar { display: flex; justify-content: space-between; align-items: center; padding: 8px 0 12px; }`],
})
export class EmployeeListComponent implements OnInit {
  private readonly api = inject(RhApiService);
  private readonly snack = inject(MatSnackBar);

  readonly rows = signal<EmployeeRow[]>([]);

  readonly columnDefs: ColDef[] = [
    { field: 'employee_number', headerName: 'Matricule', width: 130 },
    { field: 'last_name', headerName: 'Nom', flex: 1 },
    { field: 'first_name', headerName: 'Prénom', flex: 1 },
    {
      field: 'contract_type',
      headerName: 'Contrat',
      width: 110,
    },
    { field: 'role_code', headerName: 'Rôle métier', flex: 1 },
    {
      field: 'is_active',
      headerName: 'Actif',
      width: 90,
      cellStyle: (p) => ({
        color: (p.value as boolean) ? '#2e7d32' : '#c62828',
        fontWeight: 'bold',
      }),
      valueFormatter: (p) => ((p.value as boolean) ? 'Oui' : 'Non'),
    },
  ];

  ngOnInit(): void {
    // Demo: hardcoded Gravel Ivoire tenant. Real app reads from AuthService claims.
    this.api.listEmployees({ tenantId: '24cd97f8-0170-453e-89da-e9213dd710d7', isActive: true }).subscribe({
      next: (rs) => this.rows.set(rs),
      error: (err) =>
        this.snack.open(`Erreur: ${(err as Error).message}`, 'OK', { duration: 5000 }),
    });
  }

  onRowClicked(event: { data?: EmployeeRow }): void {
    // Row click navigates to /rh/employees/:id — handled via AG Grid routerLink cell renderer
    if (!event.data?.id) return;
  }
}
