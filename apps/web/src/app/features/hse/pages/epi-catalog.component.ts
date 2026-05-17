import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef } from 'ag-grid-community';
import {
  EpiCategory,
  EpiItemRow,
  HseApiService,
} from '../services/hse-api.service';
import { EpiItemCreateDialogComponent } from './epi-item-create-dialog.component';

const CATEGORY_LABEL: Record<EpiCategory, string> = {
  casque: 'Casque',
  gilet: 'Gilet HV',
  chaussures: 'Chaussures',
  gants: 'Gants',
  masque: 'Masque',
  lunettes: 'Lunettes',
  harnais: 'Harnais',
  bouchons: 'Bouchons',
  autre: 'Autre',
};

/**
 * EpiCatalogComponent — HSE-03 catalog list. Shows all EPI items configured
 * for the tenant. Mandatory items pinned to the top via service ordering.
 */
@Component({
  selector: 'gravel-epi-catalog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatChipsModule,
    MatDialogModule,
    AgGridAngular,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <div>
        <h2>Catalogue EPI</h2>
        <span class="hint">HSE-03 · {{ rows().length }} référence(s)</span>
      </div>
      <button mat-flat-button color="primary" (click)="openCreate()">
        + Nouvel EPI
      </button>
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
  styles: [
    `
      .toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 0 12px;
      }
      .hint {
        font-size: 0.75rem;
        color: #888;
      }
    `,
  ],
})
export class EpiCatalogComponent implements OnInit {
  private readonly api = inject(HseApiService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly rows = signal<EpiItemRow[]>([]);

  readonly columnDefs: ColDef[] = [
    {
      field: 'isMandatory',
      headerName: 'Obligatoire',
      width: 130,
      valueFormatter: (p) => ((p.value as boolean) ? '✓' : ''),
      cellStyle: (p: { value: unknown }): Record<string, string> =>
        (p.value as boolean)
          ? { color: '#b71c1c', fontWeight: 'bold', textAlign: 'center' }
          : { textAlign: 'center' },
    },
    {
      field: 'category',
      headerName: 'Catégorie',
      width: 160,
      valueFormatter: (p) =>
        CATEGORY_LABEL[p.value as EpiCategory] ?? (p.value as string),
    },
    { field: 'name', headerName: 'Désignation', flex: 2 },
    { field: 'description', headerName: 'Description', flex: 3 },
    {
      field: 'createdAtUtc',
      headerName: 'Créé le',
      width: 140,
      valueFormatter: (p) =>
        p.value
          ? new Date(p.value as string).toLocaleDateString('fr-CI')
          : '—',
    },
  ];

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.api.listEpiItems().subscribe({
      next: (rs) => this.rows.set(rs),
      error: (err) =>
        this.snack.open(
          `Erreur: ${(err as Error).message}`,
          'OK',
          { duration: 5000 },
        ),
    });
  }

  openCreate(): void {
    const ref = this.dialog.open(EpiItemCreateDialogComponent, {
      width: '480px',
    });
    ref.afterClosed().subscribe((created) => {
      if (created) {
        this.snack.open('EPI ajouté', 'OK', { duration: 2500 });
        this.reload();
      }
    });
  }
}
