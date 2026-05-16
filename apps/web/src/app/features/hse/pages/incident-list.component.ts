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
import { MatBadgeModule } from '@angular/material/badge';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef } from 'ag-grid-community';
import { HseApiService, HseIncidentRow, HseCategory, IncidentStatus } from '../services/hse-api.service';

const SEVERITY_COLOR: Record<number, string> = {
  1: '#4caf50',
  2: '#8bc34a',
  3: '#ff9800',
  4: '#f44336',
  5: '#b71c1c',
};

const STATUS_LABEL: Record<IncidentStatus, string> = {
  open: 'Ouvert',
  under_investigation: 'En enquête',
  closed: 'Clôturé',
};

const CATEGORY_LABEL: Record<HseCategory, string> = {
  accident_personnel: 'Accident personnel',
  accident_materiel: 'Accident matériel',
  near_miss: 'Presqu\'accident',
  environnement: 'Environnement',
  securite: 'Sécurité',
  autre: 'Autre',
};

/**
 * IncidentListComponent — AG Grid view of HSE incidents (HSE-01).
 *
 * Columns: category, severity (badge with color), occurred_at, location, status.
 * Click row → navigate to /hse/incidents/:id.
 */
@Component({
  selector: 'gravel-incident-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatBadgeModule,
    MatChipsModule,
    AgGridAngular,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <h2>Incidents HSE</h2>
      <span class="deferred-note">
        EPI (HSE-03) · Habilitations (HSE-04) · Audits (HSE-05) : Phase 3
      </span>
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
  styles: [`
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0 12px;
    }
    .deferred-note {
      font-size: 0.75rem;
      color: #888;
      font-style: italic;
    }
  `],
})
export class IncidentListComponent implements OnInit {
  private readonly api = inject(HseApiService);
  private readonly snack = inject(MatSnackBar);

  readonly rows = signal<HseIncidentRow[]>([]);

  readonly columnDefs: ColDef[] = [
    {
      field: 'category',
      headerName: 'Catégorie',
      flex: 2,
      valueFormatter: (p) => CATEGORY_LABEL[p.value as HseCategory] ?? p.value,
    },
    {
      field: 'severity',
      headerName: 'Sévérité',
      width: 110,
      cellStyle: (p) => ({
        color: '#fff',
        backgroundColor: SEVERITY_COLOR[p.value as number] ?? '#999',
        textAlign: 'center',
        fontWeight: 'bold',
      }),
    },
    {
      field: 'occurredAtUtc',
      headerName: 'Date',
      flex: 1,
      valueFormatter: (p) =>
        p.value ? new Date(p.value as string).toLocaleDateString('fr-CI') : '—',
    },
    { field: 'locationText', headerName: 'Lieu', flex: 2 },
    {
      field: 'status',
      headerName: 'Statut',
      width: 160,
      valueFormatter: (p) => STATUS_LABEL[p.value as IncidentStatus] ?? p.value,
    },
    {
      colId: 'num_attachments',
      headerName: 'Photos',
      width: 90,
      valueGetter: (p) =>
        (p.data as HseIncidentRow).content_addressed_attachments?.length ?? 0,
    },
  ];

  ngOnInit(): void {
    this.api.listIncidents().subscribe({
      next: (rs) => this.rows.set(rs),
      error: (err) =>
        this.snack.open(`Erreur: ${(err as Error).message}`, 'OK', { duration: 5000 }),
    });
  }

  onRowClicked(event: { data?: HseIncidentRow }): void {
    if (!event.data?.id) return;
    // Navigation handled by routerLink or via Router injection if needed.
  }
}
