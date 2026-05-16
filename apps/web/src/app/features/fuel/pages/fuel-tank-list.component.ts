import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef, ValueGetterParams } from 'ag-grid-community';
import { HttpClient } from '@angular/common/http';

export interface FuelTankRow {
  id: string;
  code: string;
  label: string;
  capacity_liters: number;
  balance_liters: number;
  fuel_type: string;
  last_reconciliation_drift?: number | null;
}

/** CAR-01 — Fuel tank list with live balance_liters and fill percentage. */
@Component({
  selector: 'gravel-fuel-tank-list',
  standalone: true,
  imports: [CommonModule, TranslocoModule, MatButtonModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <h2>{{ 'fuel.tanks.title' | transloco }}</h2>
      <a mat-stroked-button routerLink="./deliveries">
        {{ 'fuel.tanks.add_delivery' | transloco }}
      </a>
    </div>
    <ag-grid-angular
      class="ag-theme-material"
      style="height: 520px;"
      [rowData]="rows()"
      [columnDefs]="columnDefs"
      [pagination]="true"
      [paginationPageSize]="25"
    />
  `,
  styles: [`.toolbar { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; }`],
})
export class FuelTankListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);

  readonly rows = signal<FuelTankRow[]>([]);

  readonly columnDefs: ColDef[] = [
    { field: 'code', headerName: 'Code', width: 120 },
    { field: 'label', headerName: 'Libellé', flex: 2 },
    { field: 'capacityLiters', headerName: 'Capacité (L)', width: 140 },
    {
      field: 'balanceLiters',
      headerName: 'Solde actuel (L)',
      width: 160,
    },
    {
      colId: 'fill_pct',
      headerName: '% Remplissage',
      width: 160,
      valueGetter: (p: ValueGetterParams<FuelTankRow>) => {
        const row = p.data;
        if (!row || row.capacity_liters === 0) return null;
        return Math.round((row.balance_liters / row.capacity_liters) * 100);
      },
      cellStyle: (p): Record<string, string> | null => {
        const pct = p.value as number | null;
        if (pct == null) return null;
        if (pct < 10) return { color: 'red', fontWeight: 'bold' };
        if (pct < 30) return { color: 'orange', fontWeight: 'bold' };
        return { color: 'green' };
      },
    },
    {
      field: 'lastReconciliationDrift',
      headerName: 'Écart recon. (L)',
      width: 160,
      valueFormatter: (p) =>
        p.value == null ? '—' : `${(p.value as number).toFixed(1)} L`,
    },
    { field: 'fuelType', headerName: 'Type', width: 100 },
  ];

  ngOnInit(): void {
    this.http.get<FuelTankRow[]>('/api/fuel-tanks').subscribe({
      next: (rs) => this.rows.set(rs),
      error: (err: Error) =>
        this.snack.open(`Erreur: ${err.message}`, 'OK', { duration: 5000 }),
    });
  }
}
