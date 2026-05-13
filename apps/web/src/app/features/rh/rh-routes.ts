import { Routes } from '@angular/router';

export const RH_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/employee-list.component').then((m) => m.EmployeeListComponent),
  },
  {
    path: 'employees/new',
    loadComponent: () =>
      import('./pages/employee-form.component').then((m) => m.EmployeeFormComponent),
  },
  {
    path: 'employees/:id',
    loadComponent: () =>
      import('./pages/employee-form.component').then((m) => m.EmployeeFormComponent),
  },
  {
    path: 'certifications',
    loadComponent: () =>
      import('./pages/certification-list.component').then((m) => m.CertificationListComponent),
  },
  {
    path: 'shift-roster',
    loadComponent: () =>
      import('./pages/shift-roster.component').then((m) => m.ShiftRosterComponent),
  },
];
