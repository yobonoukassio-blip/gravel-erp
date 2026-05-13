import type { Routes } from '@angular/router';

/**
 * Concassage/Criblage feature routes (CON-01, CON-02, CRI-01).
 * Lazy-loaded from app.routes.ts under the /concassage path.
 */
export const CONCASSAGE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/crusher-session-list.component').then((m) => m.CrusherSessionListComponent),
  },
  {
    path: 'crusher/new',
    loadComponent: () =>
      import('./pages/crusher-session-form.component').then((m) => m.CrusherSessionFormComponent),
  },
  {
    path: 'crusher/:id',
    loadComponent: () =>
      import('./pages/crusher-session-form.component').then((m) => m.CrusherSessionFormComponent),
  },
  {
    path: 'screening',
    loadComponent: () =>
      import('./pages/screening-session-list.component').then((m) => m.ScreeningSessionListComponent),
  },
  {
    path: 'screening/new',
    loadComponent: () =>
      import('./pages/screening-session-form.component').then((m) => m.ScreeningSessionFormComponent),
  },
  {
    path: 'screening/:id',
    loadComponent: () =>
      import('./pages/screening-session-form.component').then((m) => m.ScreeningSessionFormComponent),
  },
];
