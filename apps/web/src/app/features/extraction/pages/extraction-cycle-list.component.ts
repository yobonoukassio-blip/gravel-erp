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
import type { ColDef } from 'ag-grid-community';
import { firstValueFrom } from 'rxjs';

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
      :host {
        display: block;
        padding: 16px;
      }
      .toolbar {
        display: flex;
        gap: 12px;
        align-items: center;
        margin-bottom: 12px;
      }
      .estimated-badge {
        background: #fff4d6;
        color: #6b4d00;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
      }
      .downtime-pill {
        display: inline-block;
        background: #ffd1d1;
        color: #8a0000;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 12px;
      }
      .ag-grid-host {
        height: 600px;
        width: 100%;
      }
      .yield-grid {
        height: 280px;
        margin-top: 24px;
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

  readonly cycleColumnDefs: ColDef<any>[] = [
    { field: 'cycleStartedAtLocal', headerName: 'Date', sortable: true, width: 180 },
    { field: 'benchId', headerName: 'Banc', sortable: true, width: 140 },
    { field: 'equipmentId', headerName: 'Engin', sortable: true, width: 140 },
    { field: 'operatorId', headerName: 'Opérateur', sortable: true, width: 140 },
    { field: 'materialType', headerName: 'Matériau', sortable: true, width: 140 },
    {
      field: 'estimatedTonnageT',
      headerName: 'Tonnage estimé (t)',
      sortable: true,
      width: 170,
      // Estimated label is announced in the toolbar; here we just print
      // the numeric value to keep the grid scannable.
      cellRenderer: (params: { value: number }) =>
        params.value != null ? `${params.value.toFixed(1)}` : '—',
    },
    {
      field: 'downtimeMinutes',
      headerName: 'Arrêt (min)',
      sortable: true,
      width: 140,
      cellRenderer: (params: { value: number | null }) => {
        if (params.value == null || params.value === 0) return '—';
        return `<span class="downtime-pill">${params.value}</span>`;
      },
    },
    { field: 'notes', headerName: 'Notes', flex: 1 },
  ];

  readonly yieldColumnDefs: ColDef<any>[] = [
    { field: 'equipmentId', headerName: 'Engin', sortable: true, width: 160 },
    { field: 'operatorId', headerName: 'Opérateur', sortable: true, width: 160 },
    { field: 'cycleCount', headerName: 'Cycles', sortable: true, width: 100 },
    { field: 'totalEstimatedT', headerName: 'Total estimé (t)', sortable: true, width: 170 },
    { field: 'productiveHours', headerName: 'Heures productives', sortable: true, width: 170 },
    { field: 'yieldTPerH', headerName: 'Rendement (t/h)', sortable: true, width: 170 },
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
