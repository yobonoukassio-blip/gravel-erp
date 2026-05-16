import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef, RowClassParams } from 'ag-grid-community';
import { RhApiService, CertificationRow, CertStatus } from '../services/rh-api.service';

const EXPIRING_SOON_DAYS = 30;

function computeCertStatus(row: CertificationRow): CertStatus {
  const today = new Date().toISOString().slice(0, 10);
  if (row.valid_to < today) return 'EXPIRED';
  const daysLeft = (new Date(row.valid_to).getTime() - new Date(today).getTime()) / 86_400_000;
  if (daysLeft <= EXPIRING_SOON_DAYS) return 'EXPIRING_SOON';
  return 'VALID';
}

const STATUS_COLOR: Record<CertStatus, string> = {
  VALID: '#e8f5e9',
  EXPIRING_SOON: '#fff3e0',
  EXPIRED: '#ffebee',
};

const STATUS_LABEL: Record<CertStatus, string> = {
  VALID: 'Valide',
  EXPIRING_SOON: 'Expire bientôt',
  EXPIRED: 'Expirée',
};

/**
 * CertificationListComponent (RH-04).
 *
 * AG Grid showing all certifications for the current site.
 * Color-coded rows: VALID = green, EXPIRING_SOON = orange, EXPIRED = red.
 * Status computed client-side from valid_to vs today.
 */
@Component({
  selector: 'gravel-certification-list',
  standalone: true,
  imports: [CommonModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>Habilitations du site</h2>

    <ag-grid-angular
      class="ag-theme-material"
      style="height: 520px;"
      [rowData]="rows()"
      [columnDefs]="columnDefs"
      [getRowStyle]="getRowStyle"
      [pagination]="true"
      [paginationPageSize]="25"
    />
  `,
})
export class CertificationListComponent implements OnInit {
  private readonly api = inject(RhApiService);
  private readonly snack = inject(MatSnackBar);

  readonly rows = signal<CertificationRow[]>([]);

  readonly columnDefs: ColDef[] = [
    {
      headerName: 'Employé',
      flex: 2,
      valueGetter: (p) => {
        const r = p.data as CertificationRow;
        return r ? `${r.employee_id}` : '';
      },
    },
    { field: 'certCode', headerName: 'Code habilitation', flex: 1 },
    {
      field: 'validFrom',
      headerName: 'Valable dès',
      width: 130,
      valueFormatter: (p) =>
        p.value ? new Date(p.value as string).toLocaleDateString('fr-CI') : '—',
    },
    {
      field: 'validTo',
      headerName: 'Expire le',
      width: 130,
      valueFormatter: (p) =>
        p.value ? new Date(p.value as string).toLocaleDateString('fr-CI') : '—',
    },
    {
      colId: 'status',
      headerName: 'Statut',
      width: 160,
      valueGetter: (p) => {
        if (!p.data) return '';
        const status = computeCertStatus(p.data as CertificationRow);
        return STATUS_LABEL[status];
      },
    },
  ];

  readonly getRowStyle = (params: RowClassParams<CertificationRow>): Record<string, string> => {
    if (!params.data) return {};
    const status = computeCertStatus(params.data);
    return { backgroundColor: STATUS_COLOR[status] };
  };

  ngOnInit(): void {
    // TODO: inject site_id from auth/route context
    this.api.listCertifications('', '').subscribe({
      next: (rs) => this.rows.set(rs),
      error: (err) =>
        this.snack.open(`Erreur: ${(err as Error).message}`, 'OK', { duration: 5000 }),
    });
  }
}
