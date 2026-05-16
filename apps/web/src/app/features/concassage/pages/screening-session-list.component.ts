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
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef, ValueFormatterParams } from 'ag-grid-community';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { renderPill, statusPillRenderer } from '../../../shared/ag-grid/status-pill';
import { ConcassageApiService, ScreeningSession } from '../services/concassage-api.service';

type SessionStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED';

interface ScreeningSessionRow extends ScreeningSession {
  has_nonconformity: boolean;
  calibre_yield_count: number;
}

/** ScreeningSessionListComponent (CRI-01). */
@Component({
  selector: 'gravel-screening-session-list',
  standalone: true,
  imports: [CommonModule, TranslocoModule, MatButtonModule, MatIconModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page gv-anim-fade">
      <header class="page-head">
        <div class="page-head-text">
          <span class="page-eyebrow">PRODUCTION · CRI-01</span>
          <h1 class="page-title">{{ 'criblage.screening_sessions.title' | transloco }}</h1>
          <p class="page-sub">Sessions de criblage et classification calibre avec non-conformités</p>
        </div>
        <button
          mat-flat-button
          color="primary"
          type="button"
          (click)="openNew()"
          class="page-action"
        >
          <mat-icon>add</mat-icon>
          {{ 'criblage.screening_sessions.open_session' | transloco }}
        </button>
      </header>

      <section class="filter-bar">
        <label class="filter-label">
          <span class="filter-key">{{ 'criblage.filters.status' | transloco }}</span>
          <select class="filter-select" (change)="onStatusFilter($event)">
            <option value="">{{ 'criblage.filters.all' | transloco }}</option>
            <option value="ACTIVE">Active</option>
            <option value="PAUSED">Pause</option>
            <option value="COMPLETED">Terminée</option>
          </select>
        </label>
      </section>

      <section class="grid-card">
        @if (loading()) {
          <div class="state-row">
            <span class="loading-dot"></span>
            <span class="loading-dot"></span>
            <span class="loading-dot"></span>
            <span>{{ 'criblage.loading' | transloco }}</span>
          </div>
        }
        <ag-grid-angular
          class="ag-theme-quartz"
          style="height: 540px;"
          [rowData]="rows()"
          [columnDefs]="columnDefs"
          [defaultColDef]="defaultColDef"
          [animateRows]="true"
          [pagination]="true"
          [paginationPageSize]="25"
          (rowClicked)="onRowClicked($event)"
        />
      </section>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .page { display: flex; flex-direction: column; gap: var(--gv-space-5); }
    .page-head {
      position: relative;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--gv-space-4);
      padding: var(--gv-space-5) var(--gv-space-6);
      background: linear-gradient(135deg, var(--gv-navy-900), var(--gv-navy-700));
      border-radius: var(--gv-radius-lg);
      overflow: hidden;
      color: oklch(96% 0.005 250);
      box-shadow: var(--gv-shadow-2);
    }
    .page-head::before {
      content: '';
      position: absolute;
      top: -50%; right: -10%;
      width: 320px; height: 320px;
      background: radial-gradient(circle, oklch(78% 0.16 85 / 0.26) 0%, transparent 60%);
      pointer-events: none;
    }
    .page-head-text { position: relative; z-index: 1; display: flex; flex-direction: column; gap: var(--gv-space-1); }
    .page-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.16em; color: var(--gv-gold); }
    .page-title { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; margin: 0; color: oklch(98% 0.005 250); }
    .page-sub { font-size: 13px; color: oklch(82% 0.012 250); margin: 0; }
    .page-action { position: relative; z-index: 1; display: inline-flex !important; align-items: center; gap: var(--gv-space-2); }

    .filter-bar {
      display: grid;
      gap: var(--gv-space-3);
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      padding: var(--gv-space-4);
      background: var(--gv-surface);
      border: 1px solid var(--gv-border);
      border-radius: var(--gv-radius-md);
      box-shadow: var(--gv-shadow-1);
    }
    .filter-label { display: flex; flex-direction: column; gap: var(--gv-space-1); }
    .filter-key { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--gv-text-soft); }
    .filter-select {
      appearance: none;
      padding: 8px 30px 8px 12px;
      background: var(--gv-surface);
      border: 1.5px solid var(--gv-border);
      border-radius: var(--gv-radius);
      font-family: var(--gv-font-sans);
      font-size: 13px;
      color: var(--gv-text);
      cursor: pointer;
      transition: border-color var(--gv-duration-1) var(--gv-ease);
      background-image: linear-gradient(45deg, transparent 50%, var(--gv-text-muted) 50%),
                        linear-gradient(135deg, var(--gv-text-muted) 50%, transparent 50%);
      background-position: calc(100% - 16px) calc(50% - 2px),
                           calc(100% - 11px) calc(50% - 2px);
      background-size: 5px 5px;
      background-repeat: no-repeat;
    }
    .filter-select:focus { outline: none; border-color: var(--gv-gold); box-shadow: 0 0 0 3px var(--gv-gold-ring); }

    .grid-card {
      background: var(--gv-surface);
      border: 1px solid var(--gv-border);
      border-radius: var(--gv-radius-md);
      box-shadow: var(--gv-shadow-1);
      overflow: hidden;
    }
    .grid-card ag-grid-angular { --ag-wrapper-border-radius: 0; }

    .state-row {
      display: flex;
      align-items: center;
      gap: var(--gv-space-2);
      padding: var(--gv-space-3) var(--gv-space-4);
      color: var(--gv-text-muted);
      font-size: 13px;
      border-bottom: 1px solid var(--gv-border);
    }
    .loading-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: var(--gv-gold);
      animation: gv-pulse-dot 1.4s var(--gv-ease) infinite;
    }
    .loading-dot:nth-child(2) { animation-delay: 0.18s; }
    .loading-dot:nth-child(3) { animation-delay: 0.36s; }
  `],
})
export class ScreeningSessionListComponent implements OnInit {
  private readonly api = inject(ConcassageApiService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly auth = inject(AuthService);

  readonly rows = signal<ScreeningSessionRow[]>([]);
  readonly loading = signal(false);

  private tenantId: string | null = null;
  private statusFilter: SessionStatus | '' = '';

  readonly defaultColDef: ColDef = {
    sortable: true,
    resizable: true,
    filter: true,
  };

  readonly columnDefs: ColDef[] = [
    {
      field: 'sessionStartUtc',
      headerName: 'Début session',
      valueFormatter: (p: ValueFormatterParams) =>
        p.value ? new Date(p.value as string).toLocaleString('fr-CI') : '—',
      width: 180,
      cellStyle: { fontVariantNumeric: 'tabular-nums', fontSize: '12px' },
    },
    {
      field: 'status',
      headerName: 'Statut',
      width: 150,
      cellRenderer: statusPillRenderer<SessionStatus>({
        ACTIVE: { tone: 'success', label: 'Active' },
        PAUSED: { tone: 'warning', label: 'Pause' },
        COMPLETED: { tone: 'info', label: 'Terminée' },
      }),
    },
    {
      field: 'screenId',
      headerName: 'Crible',
      width: 150,
      valueFormatter: (p: ValueFormatterParams) =>
        p.value ? `${String(p.value).slice(0, 8)}…` : '—',
      cellStyle: { fontFamily: 'var(--gv-font-mono)', fontSize: '12px' },
    },
    {
      field: 'inputTonnageKg',
      headerName: 'Entrée (t)',
      width: 140,
      type: 'rightAligned',
      valueFormatter: (p: ValueFormatterParams) =>
        p.value != null ? (Number(p.value) / 1000).toFixed(1) : '—',
      cellStyle: { fontVariantNumeric: 'tabular-nums', fontWeight: '600' },
    },
    {
      field: 'calibreYieldCount',
      headerName: 'Nb calibres',
      width: 140,
      type: 'rightAligned',
      cellStyle: { fontVariantNumeric: 'tabular-nums', color: 'var(--gv-text-muted)' },
    },
    {
      field: 'hasNonconformity',
      headerName: 'Conformité',
      width: 180,
      cellRenderer: (p: { value: boolean }) =>
        p.value ? renderPill('Non-conforme', 'danger') : renderPill('Conforme', 'success'),
    },
  ];

  async ngOnInit(): Promise<void> {
    const claims = await firstValueFrom(this.auth.userClaims$);
    this.tenantId = claims?.tenantId ?? null;
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
    this.statusFilter = (event.target as HTMLSelectElement).value as SessionStatus | '';
    this.loadSessions();
  }

  private loadSessions(): void {
    if (!this.tenantId) return;
    this.loading.set(true);
    this.api
      .listScreeningSessions({
        tenantId: this.tenantId,
        status: this.statusFilter || undefined,
      })
      .subscribe({
        next: (sessions) => {
          const rows: ScreeningSessionRow[] = sessions.map((s) => ({
            ...s,
            calibre_yield_count: s.calibreYields?.length ?? 0,
            has_nonconformity: (s.calibreYields ?? []).some((y) => y.is_nonconforming),
          }));
          this.rows.set(rows);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.snack.open('criblage.errors.load_failed', 'OK', { duration: 4000 });
        },
      });
  }
}
