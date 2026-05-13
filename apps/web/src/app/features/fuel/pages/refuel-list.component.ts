import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef, ValueGetterParams } from 'ag-grid-community';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HttpClient } from '@angular/common/http';

export interface RefuelListRow {
  id: string;
  equipment_id: string;
  equipment_code?: string;
  liters: number;
  hours_since_previous: number | null;
  ratio_lh: number | null;
  anomaly_flag: boolean;
  created_at_utc: string;
}

/** CAR-02 / CAR-03 — Refuel list with L/h ratio and anomaly badge. */
@Component({
  selector: 'gravel-refuel-list',
  standalone: true,
  imports: [CommonModule, TranslocoModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <h2>{{ 'fuel.refuels.title' | transloco }}</h2>
    </div>
    <ag-grid-angular
      class="ag-theme-material"
      style="height: 520px;"
      [rowData]="rows()"
      [columnDefs]="columnDefs"
      [pagination]="true"
      [paginationPageSize]="50"
    />
  `,
  styles: [`.toolbar { padding: 8px 0; }`],
})
export class RefuelListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);

  readonly rows = signal<RefuelListRow[]>([]);

  readonly columnDefs: ColDef<RefuelListRow>[] = [
    { field: 'equipment_code', headerName: 'Engin', width: 140 },
    { field: 'liters', headerName: 'Litres', width: 100 },
    {
      field: 'hours_since_previous',
      headerName: 'Heures depuis prev.',
      width: 180,
      valueFormatter: (p) => p.value == null ? '—' : `${(p.value as number).toFixed(1)} h`,
    },
    {
      colId: 'ratio_lh',
      headerName: 'Ratio L/h',
      width: 130,
      valueGetter: (p: ValueGetterParams<RefuelListRow>) => {
        const row = p.data;
        if (!row || !row.hours_since_previous) return null;
        return Math.round((row.liters / row.hours_since_previous) * 100) / 100;
      },
    },
    {
      field: 'anomaly_flag',
      headerName: 'Anomalie',
      width: 110,
      cellRenderer: (p: { value: boolean }) =>
        p.value ? `<span style="color:red;font-weight:bold">⚠ ANOMALIE</span>` : '',
    },
    {
      field: 'created_at_utc',
      headerName: 'Date',
      width: 180,
      valueFormatter: (p) => new Date(p.value as string).toLocaleString('fr-FR'),
    },
  ];

  ngOnInit(): void {
    this.http.get<RefuelListRow[]>('/api/equipment-refuels').subscribe({
      next: (rs) => this.rows.set(rs),
      error: (err: Error) =>
        this.snack.open(`Erreur: ${err.message}`, 'OK', { duration: 5000 }),
    });
  }
}
