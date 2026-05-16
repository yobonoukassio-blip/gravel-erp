import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { TranslocoModule } from '@jsverse/transloco';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef, ValueFormatterParams } from 'ag-grid-community';
import { firstValueFrom } from 'rxjs';
import { renderPill, statusPillRenderer } from '../../../shared/ag-grid/status-pill';

interface ExtractionCycleRow {
  id: string;
  operational_day_id: string;
  bench_id: string;
  equipment_id: string;
  operator_id: string;
  material_type: 'granite_brut' | 'tout_venant' | 'sterile';
  estimated_tonnage_t: number;
  cycle_started_at_local: string;
  cycle_ended_at_local: string;
  downtime_minutes: number | null;
  downtime_reason_code: string | null;
  notes: string | null;
}

interface YieldRow {
  equipment_id: string;
  operator_id: string;
  total_estimated_t: number;
  productive_hours: number;
  yield_t_per_h: number;
  cycle_count: number;
}

/**
 * Read-only review of extraction cycles + per-equipment yield (EXT-02).
 *
 * Tonnage column carries the i18n estimated_disclaimer badge so users
 * cannot confuse this with the authoritative weighing tonnage (D2-21).
 */
@Component({
  selector: 'gravel-extraction-cycle-list',
  standalone: true,
  imports: [CommonModule, TranslocoModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './extraction-cycle-list.component.html',
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

      .estimated-pill {
        position: relative; z-index: 1;
        display: inline-flex;
        align-items: center;
        gap: var(--gv-space-2);
        padding: 6px var(--gv-space-3);
        background: var(--gv-gold);
        color: var(--gv-navy-900);
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        border-radius: 999px;
        box-shadow: 0 2px 8px oklch(58% 0.16 75 / 0.4);
      }
      .estimated-dot {
        width: 6px; height: 6px;
        border-radius: 50%;
        background: var(--gv-navy-900);
        animation: gv-pulse-dot 1.8s var(--gv-ease) infinite;
      }

      .filter-bar {
        display: grid;
        gap: var(--gv-space-3);
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        padding: var(--gv-space-4);
        background: var(--gv-surface);
        border: 1px solid var(--gv-border);
        border-radius: var(--gv-radius-md);
        box-shadow: var(--gv-shadow-1);
      }
      .filter-label {
        display: flex;
        flex-direction: column;
        gap: var(--gv-space-1);
      }
      .filter-key {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--gv-text-soft);
      }
      .filter-input {
        appearance: none;
        padding: 8px 12px;
        background: var(--gv-surface);
        border: 1.5px solid var(--gv-border);
        border-radius: var(--gv-radius);
        font-family: var(--gv-font-mono);
        font-size: 12px;
        color: var(--gv-text);
        transition: border-color var(--gv-duration-1) var(--gv-ease);
      }
      .filter-input:focus {
        outline: none;
        border-color: var(--gv-gold);
        box-shadow: 0 0 0 3px var(--gv-gold-ring);
      }

      .grid-card {
        background: var(--gv-surface);
        border: 1px solid var(--gv-border);
        border-radius: var(--gv-radius-md);
        box-shadow: var(--gv-shadow-1);
        overflow: hidden;
      }
      .grid-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        padding: var(--gv-space-3) var(--gv-space-4);
        background: var(--gv-surface-2);
        border-bottom: 1px solid var(--gv-border);
      }
      .grid-title {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--gv-text-soft);
      }
      .grid-count {
        font-size: 14px;
        font-weight: 700;
        color: var(--gv-text);
      }
    `,
  ],
})
export class ExtractionCycleListComponent implements OnInit {
  private readonly http = inject(HttpClient);

  readonly cycles = signal<ExtractionCycleRow[]>([]);
  readonly yieldRows = signal<YieldRow[]>([]);
  readonly operationalDayId = signal<string>('');
  readonly equipmentFilter = signal<string>('');

  readonly cycleColumnDefs: ColDef[] = [
    {
      field: 'cycleStartedAtLocal',
      headerName: 'Date',
      sortable: true,
      width: 180,
      valueFormatter: (p: ValueFormatterParams) =>
        p.value ? new Date(p.value as string).toLocaleString('fr-CI') : '—',
      cellStyle: { fontVariantNumeric: 'tabular-nums', fontSize: '12px' },
    },
    {
      field: 'benchId',
      headerName: 'Banc',
      sortable: true,
      width: 140,
      valueFormatter: (p: ValueFormatterParams) =>
        p.value ? `${String(p.value).slice(0, 8)}…` : '—',
      cellStyle: { fontFamily: 'var(--gv-font-mono)', fontSize: '12px' },
    },
    {
      field: 'equipmentId',
      headerName: 'Engin',
      sortable: true,
      width: 140,
      valueFormatter: (p: ValueFormatterParams) =>
        p.value ? `${String(p.value).slice(0, 8)}…` : '—',
      cellStyle: { fontFamily: 'var(--gv-font-mono)', fontSize: '12px' },
    },
    {
      field: 'operatorId',
      headerName: 'Opérateur',
      sortable: true,
      width: 140,
      valueFormatter: (p: ValueFormatterParams) =>
        p.value ? `${String(p.value).slice(0, 8)}…` : '—',
      cellStyle: { fontFamily: 'var(--gv-font-mono)', fontSize: '12px' },
    },
    {
      field: 'materialType',
      headerName: 'Matériau',
      sortable: true,
      width: 160,
      cellRenderer: statusPillRenderer<string>({
        granite_brut: { tone: 'navy', label: 'Granite brut' },
        tout_venant: { tone: 'info', label: 'Tout-venant' },
        sterile: { tone: 'neutral', label: 'Stérile' },
      }),
    },
    {
      field: 'estimatedTonnageT',
      headerName: 'Tonnage estimé (t)',
      sortable: true,
      width: 170,
      type: 'rightAligned',
      valueFormatter: (p: ValueFormatterParams) =>
        p.value != null ? Number(p.value).toFixed(1) : '—',
      cellStyle: { fontVariantNumeric: 'tabular-nums', fontWeight: '600' },
    },
    {
      field: 'downtimeMinutes',
      headerName: 'Arrêt (min)',
      sortable: true,
      width: 140,
      cellRenderer: (params: { value: number | null }) => {
        if (params.value == null || params.value === 0) return '—';
        return renderPill(`${params.value} min`, 'danger');
      },
    },
    { field: 'notes', headerName: 'Notes', flex: 1, minWidth: 200 },
  ];

  readonly yieldColumnDefs: ColDef[] = [
    {
      field: 'equipmentId',
      headerName: 'Engin',
      sortable: true,
      width: 160,
      valueFormatter: (p: ValueFormatterParams) =>
        p.value ? `${String(p.value).slice(0, 8)}…` : '—',
      cellStyle: { fontFamily: 'var(--gv-font-mono)', fontSize: '12px' },
    },
    {
      field: 'operatorId',
      headerName: 'Opérateur',
      sortable: true,
      width: 160,
      valueFormatter: (p: ValueFormatterParams) =>
        p.value ? `${String(p.value).slice(0, 8)}…` : '—',
      cellStyle: { fontFamily: 'var(--gv-font-mono)', fontSize: '12px' },
    },
    {
      field: 'cycleCount',
      headerName: 'Cycles',
      sortable: true,
      width: 110,
      type: 'rightAligned',
      cellStyle: { fontVariantNumeric: 'tabular-nums', fontWeight: '600' },
    },
    {
      field: 'totalEstimatedT',
      headerName: 'Total estimé (t)',
      sortable: true,
      width: 170,
      type: 'rightAligned',
      valueFormatter: (p: ValueFormatterParams) =>
        p.value != null ? Number(p.value).toFixed(1) : '—',
      cellStyle: { fontVariantNumeric: 'tabular-nums' },
    },
    {
      field: 'productiveHours',
      headerName: 'Heures productives',
      sortable: true,
      width: 180,
      type: 'rightAligned',
      valueFormatter: (p: ValueFormatterParams) =>
        p.value != null ? Number(p.value).toFixed(1) : '—',
      cellStyle: { fontVariantNumeric: 'tabular-nums', color: 'var(--gv-text-muted)' },
    },
    {
      field: 'yieldTPerH',
      headerName: 'Rendement (t/h)',
      sortable: true,
      width: 170,
      type: 'rightAligned',
      valueFormatter: (p: ValueFormatterParams) =>
        p.value != null ? Number(p.value).toFixed(2) : '—',
      cellStyle: { fontVariantNumeric: 'tabular-nums', fontWeight: '600', color: 'oklch(38% 0.14 152)' },
    },
  ];

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const params: string[] = [];
    if (this.operationalDayId()) {
      params.push(`operational_day_id=${encodeURIComponent(this.operationalDayId())}`);
    }
    if (this.equipmentFilter()) {
      params.push(`equipment_id=${encodeURIComponent(this.equipmentFilter())}`);
    }
    const qs = params.length ? `?${params.join('&')}` : '';
    const rows = await firstValueFrom(
      this.http.get<ExtractionCycleRow[]>(`/api/extraction/cycles${qs}`),
    );
    this.cycles.set(rows);

    if (this.operationalDayId()) {
      const yieldRows = await firstValueFrom(
        this.http.get<YieldRow[]>(
          `/api/extraction/cycles/yield?operational_day_id=${encodeURIComponent(
            this.operationalDayId(),
          )}`,
        ),
      );
      this.yieldRows.set(yieldRows);
    } else {
      this.yieldRows.set([]);
    }
  }

  onDayChange(value: string): void {
    this.operationalDayId.set(value);
  }

  onEquipmentChange(value: string): void {
    this.equipmentFilter.set(value);
  }
}
