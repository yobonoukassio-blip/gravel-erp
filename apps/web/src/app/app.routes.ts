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
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
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
        path: 'foration',
        loadChildren: () =>
          import('./features/foration/foration-routes').then(
            (m) => m.FORATION_ROUTES,
          ),
      },
      {
        path: 'transport',
        loadChildren: () =>
          import('./features/transport/transport-routes').then(
            (m) => m.TRANSPORT_ROUTES,
          ),
      },
      {
        path: 'stockpile',
        loadChildren: () =>
          import('./features/stockpile/stockpile-routes').then(
            (m) => m.STOCKPILE_ROUTES,
          ),
      },
      {
        path: 'hse',
        loadChildren: () =>
          import('./features/hse/hse-routes').then(
            (m) => m.HSE_ROUTES,
          ),
      },
      {
        path: 'fuel',
        loadChildren: () =>
          import('./features/fuel/fuel-routes').then(
            (m) => m.FUEL_ROUTES,
          ),
      },
      {
        path: 'dashboard',
        loadChildren: () =>
          import('./features/dashboard-site/dashboard-routes').then(
            (m) => m.DASHBOARD_ROUTES,
          ),
      },
      {
        path: 'alerts-inbox',
        loadChildren: () =>
          import('./features/alerts-inbox/alerts-routes').then(
            (m) => m.ALERTS_ROUTES,
          ),
      },
      {
        path: 'finance',
        loadChildren: () =>
          import('./features/finance/finance-routes').then(
            (m) => m.FINANCE_ROUTES,
          ),
      },
      {
        path: 'maintenance',
        loadChildren: () =>
          import('./features/maintenance/maintenance-routes').then(
            (m) => m.MAINTENANCE_ROUTES,
          ),
      },
      {
        path: 'ventes',
        loadChildren: () =>
          import('./features/ventes/ventes-routes').then(
            (m) => m.VENTES_ROUTES,
          ),
      },
      {
        path: 'rh',
        loadChildren: () =>
          import('./features/rh/rh-routes').then((m) => m.RH_ROUTES),
      },
      {
        path: 'concassage',
        loadChildren: () =>
          import('./features/concassage/concassage-routes').then((m) => m.CONCASSAGE_ROUTES),
      },
      {
        path: 'tir',
        loadChildren: () =>
          import('./features/tir/tir-routes').then((m) => m.TIR_ROUTES),
      },
      {
        path: 'activity-log',
        canActivate: [roleGuard(['DIRECTION_GROUPE', 'DIRECTEUR_SITE'])],
        loadComponent: () =>
          import('./features/activity-log/activity-log-list.component').then(
            (m) => m.ActivityLogListComponent,
          ),
      },
      {
        path: '**',
        loadComponent: () =>
          import('./shared/not-found.component').then((m) => m.NotFoundComponent),
      },
    ],
  },
];
