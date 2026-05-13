import type { Routes } from '@angular/router';

/** HSE feature routes (HSE-01, HSE-02). Lazy-loaded from app.routes.ts. */
export const HSE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/incident-list.component').then((m) => m.IncidentListComponent),
  },
  {
    path: 'incidents/:id',
    loadComponent: () =>
      import('./pages/incident-detail.component').then((m) => m.IncidentDetailComponent),
  },
  {
    path: 'corrective-actions',
    loadComponent: () =>
      import('./pages/corrective-action-list.component').then(
        (m) => m.CorrectiveActionListComponent,
      ),
  },
];
