import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { EXTRACTION_ROUTES } from './extraction-routes';
import { ExtractionCycleListComponent } from './pages/extraction-cycle-list.component';

/**
 * Phase 2 Wave 1 — Extraction feature module (web).
 *
 * Hosts the read-only operational dashboard for extraction cycles captured
 * on mobile. Tonnages displayed here are EXPLICITLY estimated (D2-21) — the
 * UI carries the `extraction.estimated_disclaimer` i18n badge so directors
 * never confuse this view with the weighing-ticket reconciliation in P04.
 */
@NgModule({
  imports: [
    CommonModule,
    RouterModule.forChild(EXTRACTION_ROUTES),
    ExtractionCycleListComponent,
  ],
})
export class ExtractionModule {}
