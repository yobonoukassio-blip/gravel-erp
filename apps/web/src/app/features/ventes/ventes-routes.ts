import type { Routes } from '@angular/router';

/** Ventes feature routes (Phase 3 W2-P05 + W3-P06). */
export const VENTES_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'bl',
  },
  {
    path: 'customers',
    loadComponent: () =>
      import('./pages/customer-list.component').then((m) => m.CustomerListComponent),
  },
  {
    path: 'bl',
    loadComponent: () =>
      import('./pages/bl-list.component').then((m) => m.BlListComponent),
  },
  {
    path: 'bl/new',
    loadComponent: () =>
      import('./pages/bl-create.component').then((m) => m.BlCreateComponent),
  },
  {
    path: 'invoices',
    loadComponent: () =>
      import('./pages/invoice-list.component').then((m) => m.InvoiceListComponent),
  },
];
