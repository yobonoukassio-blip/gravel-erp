import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef } from 'ag-grid-community';
import { MaintenanceApiService, SparePart } from '../services/maintenance-api.service';

/** MNT-04 — Spare parts stock with below-threshold highlight. */
@Component({
  selector: 'gravel-spare-parts-stock',
  standalone: true,
  imports: [CommonModule, TranslocoModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>{{ 'maintenance.spare_parts.title' | transloco }}</h2>
    <ag-grid-angular
      class="ag-theme-material"
      style="height: 480px;"
      [rowData]="rows()"
      [columnDefs]="columnDefs"
      [getRowClass]="rowClass"
    />
  `,
  styles: [
    `
      :host ::ng-deep .ag-row-below-threshold {
        background: #ffebee;
      }
    `,
  ],
})
export class SparePartsStockComponent implements OnInit {
  private readonly api = inject(MaintenanceApiService);
  private readonly snack = inject(MatSnackBar);

  readonly rows = signal<SparePart[]>([]);

  readonly columnDefs: ColDef<any>[] = [
    { field: 'sku', headerName: 'Sku', width: 160 },
    { field: 'label', headerName: 'Libellé', flex: 2 },
    { field: 'quantityOnHand', headerName: 'Qty', width: 130 },
    { field: 'thresholdMin', headerName: 'Threshold', width: 140 },
    { field: 'belowThreshold', headerName: 'Alert', width: 110 },
  ];

  readonly rowClass = (params: { data: SparePart | undefined }): string | undefined =>
    params.data?.belowThreshold ? 'ag-row-below-threshold' : undefined;

  ngOnInit(): void {
    this.api.listSpareParts('current').subscribe({
      next: (rs) => this.rows.set(rs),
      error: (err: Error) =>
        this.snack.open(`Error: ${err.message}`, 'OK', { duration: 5000 }),
    });
  }
}
