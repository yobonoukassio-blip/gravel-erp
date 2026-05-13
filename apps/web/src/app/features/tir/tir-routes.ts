import { Routes } from '@angular/router';

export const TIR_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'explosives-ledger',
    pathMatch: 'full',
  },
  {
    path: 'explosives-ledger',
    loadComponent: () =>
      import('./pages/explosives-ledger.component').then(
        (m) => m.ExplosivesLedgerComponent,
      ),
  },
  {
    path: 'blast-plans',
    loadComponent: () =>
      import('./pages/blast-plan-list.component').then(
        (m) => m.BlastPlanListComponent,
      ),
  },
  {
    path: 'blast-plans/:id',
    loadComponent: () =>
      import('./pages/blast-plan-detail.component').then(
        (m) => m.BlastPlanDetailComponent,
      ),
  },
  {
    path: 'blast-plans/:id/report',
    loadComponent: () =>
      import('./pages/blast-report-form.component').then(
        (m) => m.BlastReportFormComponent,
      ),
  },
];
