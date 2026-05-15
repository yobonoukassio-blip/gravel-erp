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
  readonly operationalDayId = signal<string>('current');

  readonly columnDefs: ColDef<any>[] = [
    { field: 'id', headerName: 'ID', width: 90 },
    { field: 'operationalDayId', headerName: 'Journée', width: 130 },
    { field: 'truckEquipmentId', headerName: 'Camion', width: 140 },
    { field: 'driverId', headerName: 'Chauffeur', width: 140 },
    { field: 'loadedAtBenchId', headerName: 'Banc', width: 140 },
    { field: 'unloadedAtZoneId', headerName: 'Zone', width: 140 },
    { field: 'materialType', headerName: 'Matériau', width: 130 },
    { field: 'loadedTonnageT', headerName: 'Tonnage (t)', width: 110 },
    { field: 'cycleTimeMinutes', headerName: 'Cycle (min)', width: 130 },
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
