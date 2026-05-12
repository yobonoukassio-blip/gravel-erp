import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef } from 'ag-grid-community';
import { ForationApiService, DrillingPlan } from '../services/foration-api.service';

/**
 * D2-90 Chef Carrière view — list drilling plans with quick lifecycle actions.
 */
@Component({
  selector: 'gravel-drilling-plan-list',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslocoModule, MatButtonModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="drilling-plan-list">
      <header class="toolbar">
        <h1>{{ 'foration.drilling_plan_list_title' | transloco }}</h1>
        <a mat-flat-button color="primary" routerLink="new" data-testid="drilling-plan-new">
          {{ 'foration.new_plan' | transloco }}
        </a>
      </header>

      <ag-grid-angular
        class="ag-theme-material"
        style="width: 100%; height: 600px"
        [rowData]="rows()"
        [columnDefs]="columnDefs"
      />
    </div>
  `,
  styles: [
    `
      .toolbar { display: flex; justify-content: space-between; align-items: center; }
      .badge { padding: 2px 8px; border-radius: 12px; color: white; font-size: 0.75rem; }
      .badge-draft { background: #757575; }
      .badge-active { background: #2e7d32; }
      .badge-closed { background: #1565c0; }
      .badge-archived { background: #424242; }
    `,
  ],
})
export class DrillingPlanListComponent implements OnInit {
  private readonly api = inject(ForationApiService);
  private readonly snack = inject(MatSnackBar);

  readonly rows = signal<DrillingPlan[]>([]);

  readonly columnDefs: ColDef<DrillingPlan>[] = [
    { field: 'id', headerName: 'foration.columns.id', width: 90 },
    { field: 'zone_id', headerName: 'foration.columns.zone', width: 140 },
    { field: 'bench_id', headerName: 'foration.columns.bench', width: 140 },
    {
      field: 'status',
      headerName: 'foration.columns.status',
      width: 130,
      cellRenderer: (p: { value: string }) =>
        `<span class="badge badge-${p.value}">${p.value}</span>`,
    },
    { field: 'planned_hole_count', headerName: 'foration.columns.planned_holes', width: 130 },
    { field: 'target_depth_m', headerName: 'foration.columns.target_depth_m', width: 150 },
    { field: 'diameter_mm', headerName: 'foration.columns.diameter_mm', width: 130 },
    {
      field: 'assigned_machine_id',
      headerName: 'foration.columns.machine',
      width: 160,
      tooltipValueGetter: () => 'foration.machine_status_not_active',
    },
    { field: 'valid_from', headerName: 'foration.columns.valid_from', width: 170 },
  ];

  ngOnInit(): void {
    this.api.listPlans().subscribe({
      next: (plans) => this.rows.set(plans),
      error: (err) => this.snack.open(`Error: ${err.message}`, 'OK', { duration: 5000 }),
    });
  }
}
