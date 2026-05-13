import { Routes } from '@angular/router';

export const ALERTS_INBOX_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/alerts-inbox.component').then(
        (m) => m.AlertsInboxComponent,
      ),
    title: 'Alertes — Inbox',
  },
];

// Alias consumed by app.routes.ts lazy-load
export const ALERTS_ROUTES = ALERTS_INBOX_ROUTES;
