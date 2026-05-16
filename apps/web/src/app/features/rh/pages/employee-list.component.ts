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
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef } from 'ag-grid-community';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { renderPill, statusPillRenderer } from '../../../shared/ag-grid/status-pill';
import { EmployeeRow, RhApiService } from '../services/rh-api.service';

/** EmployeeListComponent (RH-01, RH-02). */
@Component({
  selector: 'gravel-employee-list',
  standalone: true,
  imports: [CommonModule, RouterModule, MatButtonModule, MatIconModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page gv-anim-fade">
      <header class="page-head">
        <div class="page-head-text">
          <span class="page-eyebrow">RH · RH-01..02</span>
          <h1 class="page-title">Employés</h1>
          <p class="page-sub">Personnel actif par site et par rôle métier</p>
        </div>
        <a
          mat-flat-button
          color="primary"
          routerLink="/rh/employees/new"
          class="page-action"
        >
          <mat-icon>person_add</mat-icon>
          Nouvel employé
        </a>
      </header>

      <section class="grid-card">
        <ag-grid-angular
          class="ag-theme-quartz"
          style="height: 540px;"
          [rowData]="rows()"
          [columnDefs]="columnDefs"
          [defaultColDef]="defaultColDef"
          [animateRows]="true"
          [pagination]="true"
          [paginationPageSize]="25"
          (rowClicked)="onRowClicked($event)"
        />
      </section>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .page { display: flex; flex-direction: column; gap: var(--gv-space-5); }
    .page-head {
      position: relative;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--gv-space-4);
      padding: var(--gv-space-5) var(--gv-space-6);
      background: linear-gradient(135deg, var(--gv-navy-900), var(--gv-navy-700));
      border-radius: var(--gv-radius-lg);
      overflow: hidden;
      color: oklch(96% 0.005 250);
      box-shadow: var(--gv-shadow-2);
    }
    .page-head::before {
      content: '';
      position: absolute;
      top: -50%; right: -10%;
      width: 320px; height: 320px;
      background: radial-gradient(circle, oklch(78% 0.16 85 / 0.26) 0%, transparent 60%);
      pointer-events: none;
    }
    .page-head-text { position: relative; z-index: 1; display: flex; flex-direction: column; gap: var(--gv-space-1); }
    .page-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.16em; color: var(--gv-gold); }
    .page-title { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; margin: 0; color: oklch(98% 0.005 250); }
    .page-sub { font-size: 13px; color: oklch(82% 0.012 250); margin: 0; }
    .page-action { position: relative; z-index: 1; display: inline-flex !important; align-items: center; gap: var(--gv-space-2); }

    .grid-card {
      background: var(--gv-surface);
      border: 1px solid var(--gv-border);
      border-radius: var(--gv-radius-md);
      box-shadow: var(--gv-shadow-1);
      overflow: hidden;
    }
    .grid-card ag-grid-angular { --ag-wrapper-border-radius: 0; }
  `],
})
export class EmployeeListComponent implements OnInit {
  private readonly api = inject(RhApiService);
  private readonly snack = inject(MatSnackBar);
  private readonly auth = inject(AuthService);

  readonly rows = signal<EmployeeRow[]>([]);

  readonly defaultColDef: ColDef = {
    sortable: true,
    resizable: true,
    filter: true,
  };

  readonly columnDefs: ColDef[] = [
    {
      field: 'employee_number',
      headerName: 'Matricule',
      width: 140,
      cellStyle: { fontFamily: 'var(--gv-font-mono)', fontSize: '12px', fontWeight: '600' },
    },
    { field: 'last_name', headerName: 'Nom', flex: 1, minWidth: 160 },
    { field: 'first_name', headerName: 'Prénom', flex: 1, minWidth: 160 },
    {
      field: 'contract_type',
      headerName: 'Contrat',
      width: 150,
      cellRenderer: statusPillRenderer<string>({
        cdi: { tone: 'success', label: 'CDI' },
        cdd: { tone: 'info', label: 'CDD' },
        interim: { tone: 'warning', label: 'Intérim' },
        sous_traitant: { tone: 'navy', label: 'Sous-traitant' },
        stage: { tone: 'neutral', label: 'Stage' },
      }),
    },
    {
      field: 'role_code',
      headerName: 'Rôle métier',
      flex: 1,
      minWidth: 160,
      cellStyle: { fontFamily: 'var(--gv-font-mono)', fontSize: '12px' },
    },
    {
      field: 'is_active',
      headerName: 'État',
      width: 130,
      cellRenderer: (p: { value: boolean }) =>
        p.value ? renderPill('Actif', 'success') : renderPill('Inactif', 'neutral'),
    },
  ];

  async ngOnInit(): Promise<void> {
    const claims = await firstValueFrom(this.auth.userClaims$);
    const tenantId = claims?.tenantId;
    if (!tenantId) return;
    this.api.listEmployees({ tenantId, isActive: true }).subscribe({
      next: (rs) => this.rows.set(rs),
      error: (err) =>
        this.snack.open(`Erreur : ${(err as Error).message}`, 'OK', { duration: 5000 }),
    });
  }

  onRowClicked(_event: { data?: EmployeeRow }): void {
    // Navigation handled via Router injection in a follow-up.
  }
}
