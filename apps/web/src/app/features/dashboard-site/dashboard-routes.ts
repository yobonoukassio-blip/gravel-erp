import { Routes } from '@angular/router';

/**
 * Dashboard site routes (DSH-01, D2-72, D2-73).
 * Lazy-loaded at /dashboard.
 */
export const DASHBOARD_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'site-director',
    pathMatch: 'full',
  },
  {
    path: 'site-director',
    loadComponent: () =>
      import('./pages/site-director-dashboard.component').then(
        (m) => m.SiteDirectorDashboardComponent,
      ),
    title: 'Dashboard Directeur Site',
  },
  {
    path: 'quarry-chief',
    loadComponent: () =>
      import('./pages/quarry-chief-dashboard.component').then(
        (m) => m.QuarryChiefDashboardComponent,
      ),
    title: 'Dashboard Chef Carrière',
  },
  {
    path: 'group',
    loadComponent: () =>
      import('../dashboard-group/dashboard-group.component').then(
        (m) => m.DashboardGroupComponent,
      ),
    title: 'Dashboard Groupe',
  },
];
