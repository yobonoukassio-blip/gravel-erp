import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef } from 'ag-grid-community';
import { ConcassageApiService, CrusherSession } from '../services/concassage-api.service';

/**
 * CrusherSessionListComponent (CON-01).
 *
 * AG Grid with columns:
 *   session_start, status (badge), crusher_id, input_tonnage_kg, output_tonnage_kg,
 *   performance_pct (%), energy_kwh, operating_hours
 *
 * CASL guard: PROCESSING_OPERATOR or QUARRY_CHIEF (enforced server-side; client shows/hides nav).
 */
@Component({
  selector: 'gravel-crusher-session-list',
  standalone: true,
  imports: [CommonModule, TranslocoModule, MatButtonModule, MatChipsModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <h2>{{ 'concassage.crusher_sessions.title' | transloco }}</h2>
      <button mat-raised-button color="primary" (click)="openNew()">
        {{ 'concassage.crusher_sessions.open_session' | transloco }}
      </button>
    </div>

    <div class="filters-bar">
      <label>
        {{ 'concassage.filters.status' | transloco }}:
        <select (change)="onStatusFilter($event)" class="filter-select">
          <option value="">{{ 'concassage.filters.all' | transloco }}</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="PAUSED">PAUSED</option>
          <option value="COMPLETED">COMPLETED</option>
        </select>
      </label>
    </div>

    @if (loading()) {
      <p class="loading-hint">{{ 'concassage.loading' | transloco }}</p>
    }

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
  styles: [
    `.toolbar { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; }`,
    `.filters-bar { padding: 4px 0 12px; display: flex; gap: 16px; }`,
    `.filter-select { margin-left: 4px; }`,
    `.loading-hint { color: #666; font-style: italic; }`,
  ],
})
export class CrusherSessionListComponent implements OnInit {
  private readonly api = inject(ConcassageApiService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  readonly rows = signal<CrusherSession[]>([]);
  readonly loading = signal(false);

  private tenantId = ''; // Stub: wired from auth context in downstream plans
  private statusFilter: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | '' = '';

  readonly columnDefs: ColDef<CrusherSession>[] = [
    {
      field: 'sessionStartUtc',
      headerName: 'concassage.columns.session_start',
      valueFormatter: (p) => p.value ? new Date(p.value as string).toLocaleString('fr-FR') : '',
      width: 180,
    },
    {
      field: 'status',
      headerName: 'concassage.columns.status',
      width: 130,
      cellRenderer: (p: { value: string }) => {
        const colors: Record<string, string> = { ACTIVE: 'green', PAUSED: 'orange', COMPLETED: 'blue' };
        return `<span style="color:${colors[p.value] ?? 'grey'};font-weight:600">${p.value}</span>`;
      },
    },
    { field: 'crusherId', headerName: 'concassage.columns.crusher_id', width: 150 },
    { field: 'calibreCode', headerName: 'concassage.columns.calibre_code', width: 120 },
    {
      field: 'inputTonnageKg',
      headerName: 'concassage.columns.input_tonnage_kg',
      width: 150,
      valueFormatter: (p) => `${Number(p.value).toLocaleString('fr-FR')} kg`,
    },
    {
      field: 'outputTonnageKg',
      headerName: 'concassage.columns.output_tonnage_kg',
      width: 160,
      valueFormatter: (p) => `${Number(p.value).toLocaleString('fr-FR')} kg`,
    },
    {
      field: 'performancePct',
      headerName: 'concassage.columns.performance_pct',
      width: 130,
      valueFormatter: (p) => `${Number(p.value).toFixed(1)} %`,
    },
    {
      field: 'energyKwh',
      headerName: 'concassage.columns.energy_kwh',
      width: 120,
      valueFormatter: (p) => `${Number(p.value).toFixed(2)} kWh`,
    },
    {
      field: 'operatingHours',
      headerName: 'concassage.columns.operating_hours',
      width: 130,
      valueFormatter: (p) => `${Number(p.value).toFixed(2)} h`,
    },
  ];

  ngOnInit(): void {
    this.loadSessions();
  }

  openNew(): void {
    void this.router.navigate(['/concassage', 'crusher', 'new']);
  }

  onRowClicked(event: { data?: CrusherSession }): void {
    if (event.data) {
      void this.router.navigate(['/concassage', 'crusher', event.data.id]);
    }
  }

  onStatusFilter(event: Event): void {
    this.statusFilter = (event.target as HTMLSelectElement).value as typeof this.statusFilter;
    this.loadSessions();
  }

  private loadSessions(): void {
    this.loading.set(true);
    this.api
      .listCrusherSessions({
        tenantId: this.tenantId,
        status: this.statusFilter || undefined,
      })
      .subscribe({
        next: (sessions) => {
          this.rows.set(sessions);
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.loading.set(false);
          this.snack.open('concassage.errors.load_failed', 'OK', { duration: 4000 });
          console.error('Failed to load crusher sessions', err);
        },
      });
  }
}
