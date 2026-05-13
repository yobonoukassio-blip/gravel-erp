import type { Routes } from '@angular/router';

/** Stockpile feature routes (STK-01, STK-02, STK-03). Lazy-loaded from app.routes.ts. */
export const STOCKPILE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/stockpile-list.component').then((m) => m.StockpileListComponent),
  },
  {
    path: 'events',
    loadComponent: () =>
      import('./pages/stockpile-events.component').then((m) => m.StockpileEventsComponent),
  },
  {
    path: 'thresholds',
    loadComponent: () =>
      import('./pages/stockpile-thresholds.component').then((m) => m.StockpileThresholdsComponent),
  },
  {
    path: 'adjustment',
    loadComponent: () =>
      import('./pages/stockpile-adjustment.component').then((m) => m.StockpileAdjustmentComponent),
  },
];
