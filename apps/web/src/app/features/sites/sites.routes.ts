import type { Routes } from '@angular/router';

export const SITE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./sites-list.component').then((m) => m.SitesListComponent),
  },
  {
    path: 'new',
    loadComponent: () =>
      import('./site-form.component').then((m) => m.SiteFormComponent),
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./site-form.component').then((m) => m.SiteFormComponent),
  },
];
