import { Routes } from '@angular/router';

export const FUEL_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/fuel-tank-list.component').then((m) => m.FuelTankListComponent),
  },
  {
    path: 'deliveries',
    loadComponent: () =>
      import('./pages/fuel-deliveries.component').then((m) => m.FuelDeliveriesComponent),
  },
  {
    path: 'refuels',
    loadComponent: () =>
      import('./pages/refuel-list.component').then((m) => m.RefuelListComponent),
  },
  {
    path: 'energy',
    loadComponent: () =>
      import('./pages/energy-readings.component').then((m) => m.EnergyReadingsComponent),
  },
];
