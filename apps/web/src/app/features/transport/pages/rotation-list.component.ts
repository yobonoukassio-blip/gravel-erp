import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef } from 'ag-grid-community';
import { TransportApiService, TruckRotation } from '../services/transport-api.service';

/**
 * Rotation list (TRP-01). Displays rotations for the current operational day.
 * AG-Grid columns per plan: id, operational_day, truck, driver, bench, zone,
 * material, tonnage, cycle_time_minutes, status (pending/in-transit/done).
 */
@Component({
  selector: 'gravel-rotation-list',
  standalone: true,
  imports: [CommonModule, TranslocoModule, MatButtonModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rotation-list.component.html',
  styles: [
    `
      .toolbar { display: flex; justify-content: space-between; align-items: center; }
      .badge { padding: 2px 8px; border-radius: 12px; color: white; font-size: 0.75rem; }
      .badge-pending { background: #757575; }
      .badge-in-transit { background: #ed6c02; }
      .badge-done { background: #2e7d32; }
    `,
  ],
})
export class RotationListComponent implements OnInit {
  private readonly api = inject(TransportApiService);
  private readonly snack = inject(MatSnackBar);

  readonly rows = signal<TruckRotation[]>([]);
  // Empty string disables the filter — list all rotations for the tenant.
  readonly operationalDayId = signal<string>('');

  readonly columnDefs: ColDef[] = [
    {
      field: 'id', headerName: 'ID', width: 100,
      valueFormatter: (p) => p.value ? String(p.value).slice(0, 8) : '—',
    },
    {
      field: 'operational_day_id', headerName: 'Journée', width: 110,
      valueFormatter: (p) => p.value ? String(p.value).slice(0, 8) : '—',
    },
    {
      field: 'truck_equipment_id', headerName: 'Camion', width: 110,
      valueFormatter: (p) => p.value ? String(p.value).slice(0, 8) : '—',
    },
    {
      field: 'driver_id', headerName: 'Chauffeur', width: 110,
      valueFormatter: (p) => p.value ? String(p.value).slice(0, 8) : '—',
    },
    {
      field: 'loaded_at_bench_id', headerName: 'Banc', width: 110,
      valueFormatter: (p) => p.value ? String(p.value).slice(0, 8) : '—',
    },
    {
      field: 'unloaded_at_zone_id', headerName: 'Zone', width: 110,
      valueFormatter: (p) => p.value ? String(p.value).slice(0, 8) : '—',
    },
    { field: 'material_type', headerName: 'Matériau', width: 130 },
    {
      field: 'loaded_tonnage_t', headerName: 'Tonnage (t)', width: 110,
      valueFormatter: (p) => p.value != null ? Number(p.value).toFixed(2) : '—',
    },
    { field: 'cycle_time_minutes', headerName: 'Cycle (min)', width: 110 },
    {
      colId: 'status',
      headerName: 'Statut',
      width: 140,
      valueGetter: (p) => this.statusOf(p.data),
      cellRenderer: (p: { value: string }) =>
        `<span class="badge badge-${p.value}">${p.value}</span>`,
    },
  ];

  ngOnInit(): void {
    this.api.listRotations(this.operationalDayId()).subscribe({
      next: (rs) => this.rows.set(rs),
      error: (err) => this.snack.open(`Error: ${err.message}`, 'OK', { duration: 5000 }),
    });
  }

  private statusOf(r: TruckRotation | null | undefined): string {
    if (!r) return 'pending';
    if (r.unloaded_at_utc) return 'done';
    if (r.truck_equipment_id) return 'in-transit';
    return 'pending';
  }
}
