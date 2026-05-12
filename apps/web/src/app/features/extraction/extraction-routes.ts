import { Routes } from '@angular/router';
import { ExtractionCycleListComponent } from './pages/extraction-cycle-list.component';

export const EXTRACTION_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'cycles',
  },
  {
    path: 'cycles',
    component: ExtractionCycleListComponent,
  },
];
