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
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef } from 'ag-grid-community';
import { ConcassageApiService, ScreeningSession } from '../services/concassage-api.service';

/** Row view model with `has_nonconformity` derived client-side from calibre_yields. */
interface ScreeningSessionRow extends ScreeningSession {
  has_nonconformity: boolean;
  calibre_yield_count: number;
}

/**
 * ScreeningSessionListComponent (CRI-01).
 *
 * AG Grid columns:
 *   session_start, status, screen_id, input_tonnage_kg,
 *   calibre_yield_count, has_nonconformity (boolean badge)
 *
 * has_nonconformity is derived client-side from calibre_yields.any(is_nonconforming=true).
 */
@Component({
  selector: 'gravel-screening-session-list',
  standalone: true,
  imports: [CommonModule, TranslocoModule, MatButtonModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <h2>{{ 'criblage.screening_sessions.title' | transloco }}</h2>
      <button mat-raised-button color="primary" (click)="openNew()">
        {{ 'criblage.screening_sessions.open_session' | transloco }}
      </button>
    </div>

    <div class="filters-bar">
      <label>
        {{ 'criblage.filters.status' | transloco }}:
        <select (change)="onStatusFilter($event)" class="filter-select">
          <option value="">{{ 'criblage.filters.all' | transloco }}</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="PAUSED">PAUSED</option>
          <option value="COMPLETED">COMPLETED</option>
        </select>
      </label>
    </div>

    @if (loading()) {
      <p class="loading-hint">{{ 'criblage.loading' | transloco }}</p>
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
export class ScreeningSessionListComponent implements OnInit {
  private readonly api = inject(ConcassageApiService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  readonly rows = signal<ScreeningSessionRow[]>([]);
  readonly loading = signal(false);

  private tenantId = ''; // Stub: from auth context
  private statusFilter: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | '' = '';

  readonly columnDefs: ColDef<ScreeningSessionRow>[] = [
    {
      field: 'sessionStartUtc',
      headerName: 'criblage.columns.session_start',
      valueFormatter: (p) => p.value ? new Date(p.value as string).toLocaleString('fr-FR') : '',
      width: 180,
    },
    {
      field: 'status',
      headerName: 'criblage.columns.status',
      width: 130,
      cellRenderer: (p: { value: string }) => {
        const colors: Record<string, string> = { ACTIVE: 'green', PAUSED: 'orange', COMPLETED: 'blue' };
        return `<span style="color:${colors[p.value] ?? 'grey'};font-weight:600">${p.value}</span>`;
      },
    },
    { field: 'screenId', headerName: 'criblage.columns.screen_id', width: 150 },
    {
      field: 'inputTonnageKg',
      headerName: 'criblage.columns.input_tonnage_kg',
      width: 160,
      valueFormatter: (p) => `${Number(p.value).toLocaleString('fr-FR')} kg`,
    },
    {
      field: 'calibre_yield_count',
      headerName: 'criblage.columns.calibre_yield_count',
      width: 150,
    },
    {
      field: 'has_nonconformity',
      headerName: 'criblage.columns.has_nonconformity',
      width: 160,
      cellRenderer: (p: { value: boolean }) => {
        if (p.value) {
          return '<span style="color:red;font-weight:700">NON-CONFORME</span>';
        }
        return '<span style="color:green">OK</span>';
      },
    },
  ];

  ngOnInit(): void {
    this.loadSessions();
  }

  openNew(): void {
    void this.router.navigate(['/concassage', 'screening', 'new']);
  }

  onRowClicked(event: { data?: ScreeningSessionRow }): void {
    if (event.data) {
      void this.router.navigate(['/concassage', 'screening', event.data.id]);
    }
  }

  onStatusFilter(event: Event): void {
    this.statusFilter = (event.target as HTMLSelectElement).value as typeof this.statusFilter;
    this.loadSessions();
  }

  private loadSessions(): void {
    this.loading.set(true);
    this.api
      .listScreeningSessions({
        tenantId: this.tenantId,
        status: this.statusFilter || undefined,
      })
      .subscribe({
        next: (sessions) => {
          // Derive has_nonconformity client-side from calibre_yields
          const rows: ScreeningSessionRow[] = sessions.map((s) => ({
            ...s,
            calibre_yield_count: s.calibreYields?.length ?? 0,
            has_nonconformity: (s.calibreYields ?? []).some((y) => y.is_nonconforming),
          }));
          this.rows.set(rows);
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.loading.set(false);
          this.snack.open('criblage.errors.load_failed', 'OK', { duration: 4000 });
          console.error('Failed to load screening sessions', err);
        },
      });
  }
}
