import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { HSE_ROUTES } from './hse-routes';

/**
 * HseModule — thin lazy-loaded wrapper for standalone HSE components.
 *
 * Covers: HSE-01 incident list/detail, HSE-02 CAPA list.
 * Deferred: HSE-03 (EPI), HSE-04 (Habilitations), HSE-05 (Audits) — Phase 3.
 */
@NgModule({
  imports: [RouterModule.forChild(HSE_ROUTES)],
})
export class HseModule {}
