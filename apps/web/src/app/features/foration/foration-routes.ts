import type { Routes } from '@angular/router';

/**
 * Standalone-component routes for the foration feature (D2-90).
 * Lazy-loaded from app.routes.ts via `loadChildren`.
 */
export const FORATION_ROUTES: Routes = [
  { path: '', redirectTo: 'plans', pathMatch: 'full' },
  {
    path: 'plans',
    loadComponent: () =>
      import('./pages/drilling-plan-list.component').then(
        (m) => m.DrillingPlanListComponent,
      ),
  },
  {
    path: 'plans/new',
    loadComponent: () =>
      import('./pages/drilling-plan-edit.component').then(
        (m) => m.DrillingPlanEditComponent,
      ),
  },
  {
    path: 'plans/:id',
    loadComponent: () =>
      import('./pages/drilling-plan-edit.component').then(
        (m) => m.DrillingPlanEditComponent,
      ),
  },
  {
    path: 'holes',
    loadComponent: () =>
      import('./pages/drilled-hole-review.component').then(
        (m) => m.DrilledHoleReviewComponent,
      ),
  },
];
