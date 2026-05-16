import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef, ValueFormatterParams } from 'ag-grid-community';
import { statusPillRenderer } from '../../../shared/ag-grid/status-pill';
import { DrillingPlan, ForationApiService } from '../services/foration-api.service';

/** D2-90 Chef Carrière view — list drilling plans with quick lifecycle actions. */
@Component({
  selector: 'gravel-drilling-plan-list',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslocoModule, MatButtonModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page gv-anim-fade">
      <header class="page-head">
        <div class="page-head-text">
          <span class="page-eyebrow">PRODUCTION · FOR-01..05</span>
          <h1 class="page-title">Plans de foration</h1>
          <p class="page-sub">Plans actifs et brouillons par banc et zone</p>
        </div>
        <a
          mat-flat-button
          color="primary"
          routerLink="new"
          data-testid="drilling-plan-new"
          class="page-action"
        >
          <span class="page-action-plus" aria-hidden="true">+</span>
          Nouveau plan
        </a>
      </header>

      <section class="grid-card">
        <ag-grid-angular
          class="ag-theme-quartz"
          style="width: 100%; height: 620px;"
          [rowData]="rows()"
          [columnDefs]="columnDefs"
          [defaultColDef]="defaultColDef"
          [animateRows]="true"
          [pagination]="true"
          [paginationPageSize]="50"
        />
      </section>
    </div>
  `,
  styles: [
    `
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
      .page-action {
        position: relative;
        z-index: 1;
        display: inline-flex !important;
        align-items: center;
        gap: var(--gv-space-2);
      }
      .page-action-plus { font-size: 16px; font-weight: 700; line-height: 1; }
      .grid-card {
        background: var(--gv-surface);
        border: 1px solid var(--gv-border);
        border-radius: var(--gv-radius-md);
        box-shadow: var(--gv-shadow-1);
        overflow: hidden;
      }
      .grid-card ag-grid-angular { --ag-wrapper-border-radius: 0; }
    `,
  ],
})
export class DrillingPlanListComponent implements OnInit {
  private readonly api = inject(ForationApiService);
  private readonly snack = inject(MatSnackBar);

  readonly rows = signal<DrillingPlan[]>([]);

  readonly defaultColDef: ColDef = {
    sortable: true,
    resizable: true,
    filter: true,
  };

  readonly columnDefs: ColDef[] = [
    {
      field: 'id',
      headerName: 'ID',
      width: 110,
      valueFormatter: (p: ValueFormatterParams) =>
        p.value ? `${String(p.value).slice(0, 8)}…` : '—',
      cellStyle: { fontFamily: 'var(--gv-font-mono)', fontSize: '12px', color: 'var(--gv-text-muted)' },
    },
    {
      headerName: 'Zone',
      width: 140,
      valueGetter: (p) =>
        (p.data as unknown as { zoneId?: string })?.zoneId?.slice(0, 8) ?? '—',
      cellStyle: { fontFamily: 'var(--gv-font-mono)', fontSize: '12px' },
    },
    {
      headerName: 'Banc',
      width: 140,
      valueGetter: (p) =>
        (p.data as unknown as { benchId?: string })?.benchId?.slice(0, 8) ?? '—',
      cellStyle: { fontFamily: 'var(--gv-font-mono)', fontSize: '12px' },
    },
    {
      field: 'status',
      headerName: 'Statut',
      width: 150,
      cellRenderer: statusPillRenderer<string>({
        draft: { tone: 'neutral', label: 'Brouillon' },
        active: { tone: 'success', label: 'Actif' },
        closed: { tone: 'info', label: 'Clôturé' },
        archived: { tone: 'neutral', label: 'Archivé' },
      }),
    },
    {
      headerName: 'Trous planifiés',
      width: 150,
      type: 'rightAligned',
      valueGetter: (p) =>
        (p.data as unknown as { plannedHoleCount?: number })?.plannedHoleCount,
      valueFormatter: (p: ValueFormatterParams) =>
        p.value != null ? new Intl.NumberFormat('fr-FR').format(Number(p.value)) : '—',
      cellStyle: { fontVariantNumeric: 'tabular-nums', fontWeight: '600' },
    },
    {
      headerName: 'Profondeur (m)',
      width: 150,
      type: 'rightAligned',
      valueGetter: (p) =>
        (p.data as unknown as { targetDepthM?: string })?.targetDepthM,
      valueFormatter: (p: ValueFormatterParams) =>
        p.value != null ? Number(p.value).toFixed(1) : '—',
      cellStyle: { fontVariantNumeric: 'tabular-nums' },
    },
    {
      headerName: 'Diamètre (mm)',
      width: 140,
      type: 'rightAligned',
      valueGetter: (p) =>
        (p.data as unknown as { diameterMm?: number })?.diameterMm,
      valueFormatter: (p: ValueFormatterParams) =>
        p.value != null ? new Intl.NumberFormat('fr-FR').format(Number(p.value)) : '—',
      cellStyle: { fontVariantNumeric: 'tabular-nums', color: 'var(--gv-text-muted)' },
    },
    {
      headerName: 'Machine',
      width: 160,
      valueGetter: (p) =>
        (p.data as unknown as { assignedMachineId?: string })?.assignedMachineId ?? '—',
      cellStyle: { fontFamily: 'var(--gv-font-mono)', fontSize: '12px' },
    },
    {
      headerName: 'Valide depuis',
      width: 160,
      valueGetter: (p) =>
        (p.data as unknown as { validFrom?: string })?.validFrom,
      valueFormatter: (p: ValueFormatterParams) =>
        p.value ? new Date(p.value as string).toLocaleDateString('fr-FR') : '—',
      cellStyle: { fontVariantNumeric: 'tabular-nums', fontSize: '12px' },
    },
  ];

  ngOnInit(): void {
    this.api.listPlans().subscribe({
      next: (plans) => this.rows.set(plans),
      error: (err) =>
        this.snack.open(`Erreur : ${err.message}`, 'OK', { duration: 5000 }),
    });
  }
}
