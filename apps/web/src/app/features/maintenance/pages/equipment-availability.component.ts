import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef } from 'ag-grid-community';
import {
  EquipmentAvailability,
  MaintenanceApiService,
} from '../services/maintenance-api.service';

/** MNT-05 — MTBF / MTTR availability widget. */
@Component({
  selector: 'gravel-equipment-availability',
  standalone: true,
  imports: [CommonModule, TranslocoModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>{{ 'maintenance.availability.title' | transloco }}</h2>
    <p class="hint">MTBF/MTTR rolling 12 months. "N/A" displayed when no failures recorded.</p>
    <ag-grid-angular
      class="ag-theme-material"
      style="height: 440px;"
      [rowData]="rows()"
      [columnDefs]="columnDefs"
    />
  `,
  styles: [
    `
      .hint {
        color: #666;
        font-size: 0.875rem;
        margin: 4px 0 12px;
      }
    `,
  ],
})
export class EquipmentAvailabilityComponent implements OnInit {
  private readonly api = inject(MaintenanceApiService);
  private readonly snack = inject(MatSnackBar);

  readonly rows = signal<EquipmentAvailability[]>([]);

  readonly columnDefs: ColDef[] = [
    { field: 'equipmentLabel', headerName: 'Équipement', flex: 2 },
    { field: 'status', headerName: 'Statut', width: 140 },
    {
      field: 'mtbfHours',
      headerName: 'Mtbf H',
      width: 130,
      valueFormatter: (p) => (p.value == null ? 'N/A' : Number(p.value).toFixed(1)),
    },
    {
      field: 'mttrHours',
      headerName: 'Mttr H',
      width: 130,
      valueFormatter: (p) => (p.value == null ? 'N/A' : Number(p.value).toFixed(1)),
    },
    { field: 'failureCount', headerName: 'Failures', width: 110 },
  ];

  ngOnInit(): void {
    this.api.availabilityKpi('current').subscribe({
      next: (rs) => this.rows.set(rs),
      error: (err: Error) =>
        this.snack.open(`Error: ${err.message}`, 'OK', { duration: 5000 }),
    });
  }
}
