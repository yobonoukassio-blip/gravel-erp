import type { Routes } from '@angular/router';

/** Maintenance feature routes (Phase 3 W2-P04). */
export const MAINTENANCE_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'work-orders',
  },
  {
    path: 'work-orders',
    loadComponent: () =>
      import('./pages/work-order-list.component').then((m) => m.WorkOrderListComponent),
  },
  {
    path: 'spare-parts',
    loadComponent: () =>
      import('./pages/spare-parts-stock.component').then((m) => m.SparePartsStockComponent),
  },
  {
    path: 'availability',
    loadComponent: () =>
      import('./pages/equipment-availability.component').then(
        (m) => m.EquipmentAvailabilityComponent,
      ),
  },
];
