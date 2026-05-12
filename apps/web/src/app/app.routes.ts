import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/roles/role.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'callback',
    loadComponent: () =>
      import('./features/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/main-layout.component').then((m) => m.MainLayoutComponent),
    children: [
      {
        path: 'sites',
        loadChildren: () =>
          import('./features/sites/sites.routes').then((m) => m.SITE_ROUTES),
      },
      {
        path: 'sites/:siteId/zones',
        loadComponent: () =>
          import('./features/zones/zones-list.component').then((m) => m.ZonesListComponent),
      },
      {
        path: 'sites/:siteId/zones/new',
        loadComponent: () =>
          import('./features/zones/zone-form.component').then((m) => m.ZoneFormComponent),
      },
      {
        path: 'sites/:siteId/zones/:zoneId/benches',
        loadComponent: () =>
          import('./features/benches/benches-list.component').then(
            (m) => m.BenchesListComponent,
          ),
      },
      {
        path: 'sites/:siteId/permits',
        loadComponent: () =>
          import('./features/permits/permits-list.component').then(
            (m) => m.PermitsListComponent,
          ),
      },
      {
        path: 'sites/:siteId/permits/new',
        loadComponent: () =>
          import('./features/permits/permit-form.component').then(
            (m) => m.PermitFormComponent,
          ),
      },
      {
        path: 'extraction',
        loadChildren: () =>
          import('./features/extraction/extraction-routes').then(
            (m) => m.EXTRACTION_ROUTES,
          ),
      },
      {
        path: 'activity-log',
        canActivate: [roleGuard(['DIRECTION_GROUPE', 'DIRECTEUR_SITE'])],
        loadComponent: () =>
          import('./features/activity-log/activity-log-list.component').then(
            (m) => m.ActivityLogListComponent,
          ),
      },
    ],
  },
];
