import type { Routes } from '@angular/router';

/**
 * Transport feature routes (TRP-01, TRP-02, TRP-03). Lazy-loaded from
 * app.routes.ts via `loadChildren`.
 *   - rotations  : list rotations for an operational day
 *   - dispatch   : manual truck assignment board (TRP-03)
 *   - tickets    : weighing ticket list (TRP-02)
 */
export const TRANSPORT_ROUTES: Routes = [
  { path: '', redirectTo: 'rotations', pathMatch: 'full' },
  {
    path: 'rotations',
    loadComponent: () =>
      import('./pages/rotation-list.component').then(
        (m) => m.RotationListComponent,
      ),
  },
  {
    path: 'dispatch',
    loadComponent: () =>
      import('./pages/dispatch-board.component').then(
        (m) => m.DispatchBoardComponent,
      ),
  },
  {
    path: 'tickets',
    loadComponent: () =>
      import('./pages/weighing-ticket-list.component').then(
        (m) => m.WeighingTicketListComponent,
      ),
  },
];
