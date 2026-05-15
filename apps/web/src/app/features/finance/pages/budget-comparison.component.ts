import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef } from 'ag-grid-community';
import { BudgetVsActual, FinanceApiService } from '../services/finance-api.service';

/** FIN-03 — Budget vs Actual comparison view. */
@Component({
  selector: 'gravel-budget-comparison',
  standalone: true,
  imports: [CommonModule, TranslocoModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="header">
      <h2>{{ 'finance.budget.title' | transloco }}</h2>
      <span class="provisional" data-testid="provisional-badge">
        Provisoire — coût/tonne et marges en cours de consolidation
      </span>
    </div>
    <ag-grid-angular
      class="ag-theme-material"
      style="height: 480px;"
      [rowData]="rows()"
      [columnDefs]="columnDefs"
    />
  `,
  styles: [
    `
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 0;
      }
      .provisional {
        background: #fff3cd;
        color: #856404;
        padding: 4px 12px;
        border-radius: 12px;
        font-size: 0.75rem;
      }
    `,
  ],
})
export class BudgetComparisonComponent implements OnInit {
  private readonly api = inject(FinanceApiService);
  private readonly snack = inject(MatSnackBar);

  readonly rows = signal<BudgetVsActual[]>([]);

  readonly columnDefs: ColDef<any>[] = [
    { field: 'category', headerName: 'Catégorie', flex: 1 },
    { field: 'budgetMinor', headerName: 'Budget', width: 160 },
    { field: 'actualMinor', headerName: 'Réel', width: 160 },
    { field: 'variancePct', headerName: 'Variance Pct', width: 140 },
    {
      field: 'status',
      headerName: 'Statut',
      width: 140,
      cellRenderer: (p: { value: string }) =>
        `<span class="badge badge-${p.value}">${p.value}</span>`,
    },
  ];

  ngOnInit(): void {
    const now = new Date();
    const asOf = now.toISOString().slice(0, 10);
    this.api.budgetVsActual('current', now.getFullYear(), asOf).subscribe({
      next: (rs) => this.rows.set(rs),
      error: (err: Error) =>
        this.snack.open(`Error: ${err.message}`, 'OK', { duration: 5000 }),
    });
  }
}
