import type { Routes } from '@angular/router';

/** Finance feature routes (Phase 4). */
export const FINANCE_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'consolidation',
  },
  {
    path: 'consolidation',
    loadComponent: () =>
      import('./pages/consolidation.component').then((m) => m.ConsolidationComponent),
  },
  {
    path: 'budget',
    loadComponent: () =>
      import('./pages/budget-comparison.component').then((m) => m.BudgetComparisonComponent),
  },
  {
    path: 'ohada-export',
    loadComponent: () =>
      import('./pages/ohada-export.component').then((m) => m.OhadaExportComponent),
  },
];
