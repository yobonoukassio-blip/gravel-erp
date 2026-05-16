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
import type { ColDef } from 'ag-grid-community';
import { HseApiService, CorrectiveActionRow, CapaStatus, CapaPriority } from '../services/hse-api.service';

const STATUS_LABEL: Record<CapaStatus, string> = {
  open: 'Ouverte',
  in_progress: 'En cours',
  done: 'Terminée',
  verified: 'Vérifiée',
  closed: 'Clôturée',
};

const PRIORITY_COLOR: Record<CapaPriority, string> = {
  low: '#e3f2fd',
  medium: '#fff9c4',
  high: '#ffe0b2',
  critical: '#ffcdd2',
};

/**
 * CorrectiveActionListComponent — AG Grid view of CAPA items (HSE-02).
 *
 * Columns: description, incident_id, due_date, priority, status.
 * HSE_OFFICER can transition status via action buttons (stub — wired to API in Phase 3 UI).
 */
@Component({
  selector: 'gravel-corrective-action-list',
  standalone: true,
  imports: [CommonModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <h2>Actions Correctives (CAPA)</h2>
    </div>
    <ag-grid-angular
      class="ag-theme-material"
      style="height: 480px;"
      [rowData]="rows()"
      [columnDefs]="columnDefs"
      [pagination]="true"
      [paginationPageSize]="25"
    />
  `,
  styles: [`.toolbar { padding: 8px 0 12px; }`],
})
export class CorrectiveActionListComponent implements OnInit {
  private readonly api = inject(HseApiService);
  private readonly snack = inject(MatSnackBar);

  readonly rows = signal<CorrectiveActionRow[]>([]);

  readonly columnDefs: ColDef[] = [
    { field: 'description', headerName: 'Description', flex: 3 },
    { field: 'incidentId', headerName: 'Incident', width: 280 },
    {
      field: 'dueDateLocal',
      headerName: 'Échéance',
      width: 130,
    },
    {
      field: 'priority',
      headerName: 'Priorité',
      width: 110,
      cellStyle: (p: { value: unknown }): Record<string, string> => ({
        backgroundColor: PRIORITY_COLOR[p.value as CapaPriority] ?? '#fff',
      }),
    },
    {
      field: 'status',
      headerName: 'Statut',
      width: 140,
      valueFormatter: (p) => STATUS_LABEL[p.value as CapaStatus] ?? p.value,
    },
  ];

  ngOnInit(): void {
    // Stub: loads all CAPAs. Real implementation filters by incident or site.
    this.rows.set([]);
  }
}
