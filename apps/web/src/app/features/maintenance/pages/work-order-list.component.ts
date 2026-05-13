import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef } from 'ag-grid-community';
import { MaintenanceApiService, WorkOrder } from '../services/maintenance-api.service';

/** MNT-03 — Work order list. */
@Component({
  selector: 'gravel-work-order-list',
  standalone: true,
  imports: [CommonModule, TranslocoModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>{{ 'maintenance.work_orders.title' | transloco }}</h2>
    <ag-grid-angular
      class="ag-theme-material"
      style="height: 520px;"
      [rowData]="rows()"
      [columnDefs]="columnDefs"
      [pagination]="true"
      [paginationPageSize]="50"
    />
  `,
})
export class WorkOrderListComponent implements OnInit {
  private readonly api = inject(MaintenanceApiService);
  private readonly snack = inject(MatSnackBar);

  readonly rows = signal<WorkOrder[]>([]);

  readonly columnDefs: ColDef<WorkOrder>[] = [
    { field: 'id', headerName: 'maintenance.columns.id', width: 100 },
    { field: 'equipmentId', headerName: 'maintenance.columns.equipment', width: 160 },
    { field: 'type', headerName: 'maintenance.columns.type', width: 120 },
    { field: 'status', headerName: 'maintenance.columns.status', width: 120 },
    { field: 'diagnosis', headerName: 'maintenance.columns.diagnosis', flex: 2 },
    { field: 'downtimeMinutes', headerName: 'maintenance.columns.downtime_min', width: 140 },
    { field: 'laborHours', headerName: 'maintenance.columns.labor_h', width: 110 },
    { field: 'openedAtUtc', headerName: 'maintenance.columns.opened_at', width: 180 },
  ];

  ngOnInit(): void {
    this.api.listWorkOrders('current').subscribe({
      next: (rs) => this.rows.set(rs),
      error: (err: Error) =>
        this.snack.open(`Error: ${err.message}`, 'OK', { duration: 5000 }),
    });
  }
}
