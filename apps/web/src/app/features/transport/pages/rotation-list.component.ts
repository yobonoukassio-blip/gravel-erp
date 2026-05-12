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

  readonly columnDefs: ColDef<TruckRotation>[] = [
    { field: 'id', headerName: 'transport.columns.id', width: 90 },
    { field: 'operational_day_id', headerName: 'transport.columns.operational_day', width: 130 },
    { field: 'truck_equipment_id', headerName: 'transport.columns.truck', width: 140 },
    { field: 'driver_id', headerName: 'transport.columns.driver', width: 140 },
    { field: 'loaded_at_bench_id', headerName: 'transport.columns.bench', width: 140 },
    { field: 'unloaded_at_zone_id', headerName: 'transport.columns.zone', width: 140 },
    { field: 'material_type', headerName: 'transport.columns.material', width: 130 },
    { field: 'loaded_tonnage_t', headerName: 'transport.columns.tonnage', width: 110 },
    { field: 'cycle_time_minutes', headerName: 'transport.columns.cycle_time', width: 130 },
    {
      colId: 'status',
      headerName: 'transport.columns.status',
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
