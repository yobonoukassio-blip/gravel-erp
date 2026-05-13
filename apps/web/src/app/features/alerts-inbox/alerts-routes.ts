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
