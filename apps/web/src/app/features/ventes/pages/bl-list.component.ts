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
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { BonDeLivraison, VentesApiService } from '../services/ventes-api.service';
import { BlSignDialogComponent } from './bl-sign-dialog.component';

/** VTE-03 — BL list with status badges, content hash, and inline sign action. */
@Component({
  selector: 'gravel-bl-list',
  standalone: true,
  imports: [CommonModule, TranslocoModule, MatButtonModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-header">
      <h2>{{ 'ventes.bl.title' | transloco }}</h2>
    </div>

    <ag-grid-angular
      class="ag-theme-material"
      style="height: 540px;"
      [rowData]="rows()"
      [columnDefs]="columnDefs"
      [pagination]="true"
      [paginationPageSize]="50"
    />
  `,
  styles: [`
    .page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  `],
})
export class BlListComponent implements OnInit {
  private readonly api = inject(VentesApiService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly rows = signal<BonDeLivraison[]>([]);

  readonly columnDefs: ColDef<BonDeLivraison>[] = [
    { field: 'number', headerName: 'N° BL', width: 180 },
    { field: 'customerId', headerName: 'Client', width: 160 },
    { field: 'calibreCode', headerName: 'Calibre', width: 110 },
    { field: 'tonnageKg', headerName: 'Tonnage (kg)', width: 130 },
    { field: 'deliveryDate', headerName: 'Date livraison', width: 130 },
    {
      field: 'status',
      headerName: 'Statut',
      width: 140,
      cellRenderer: (p: ICellRendererParams<BonDeLivraison>) => {
        const s = p.value as string;
        const colors: Record<string, string> = {
          draft: '#9E9E9E',
          pending_signature: '#F59E0B',
          signed: '#22C55E',
          cancelled: '#EF4444',
        };
        const color = colors[s] ?? '#9E9E9E';
        return `<span style="background:${color};color:#fff;padding:2px 8px;border-radius:12px;font-size:12px">${s}</span>`;
      },
    },
    {
      field: 'contentSha256',
      headerName: 'Hash',
      flex: 1,
      valueFormatter: (p) => (p.value ? `${String(p.value).slice(0, 16)}…` : '—'),
    },
    {
      headerName: 'Action',
      width: 120,
      sortable: false,
      filter: false,
      cellRenderer: (p: ICellRendererParams<BonDeLivraison>) => {
        if (!p.data || p.data.status === 'signed' || p.data.status === 'cancelled') {
          return '';
        }
        const btn = document.createElement('button');
        btn.textContent = 'Signer';
        btn.style.cssText =
          'background:#1D4ED8;color:#fff;border:none;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:12px';
        btn.addEventListener('click', () => this.openSignDialog(p.data!));
        return btn;
      },
    },
  ];

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.api.listBLs().subscribe({
      next: (rs) => this.rows.set(rs),
      error: (err: Error) =>
        this.snack.open(`Erreur : ${err.message}`, 'OK', { duration: 5000 }),
    });
  }

  openSignDialog(bl: BonDeLivraison): void {
    const ref = this.dialog.open(BlSignDialogComponent, {
      width: '560px',
      data: { bl },
      disableClose: true,
    });
    ref.afterClosed().subscribe((updated: BonDeLivraison | null) => {
      if (updated) this.load();
    });
  }
}
