import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TIR_ROUTES } from './tir-routes';

/**
 * TirModule — lazy-loaded via /tir route.
 *
 * Provides:
 *   - ExplosivesLedgerComponent (AG Grid read-only + Add Receipt Formly form)
 *   - BlastPlanListComponent (AG Grid with status badges)
 *   - BlastPlanDetailComponent (state machine action buttons)
 *   - BlastReportFormComponent (Formly form for FIRED plan)
 */
@NgModule({
  imports: [
    CommonModule,
    RouterModule.forChild(TIR_ROUTES),
  ],
})
export class TirModule {}
