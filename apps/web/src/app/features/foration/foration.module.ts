import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { FORATION_ROUTES } from './foration-routes';

/**
 * ForationModule — thin lazy-loaded wrapper around the standalone
 * components in `./pages/*`. The plan acceptance criteria reference this
 * symbol; Angular 20 idiom prefers standalone routes (FORATION_ROUTES),
 * which this module simply re-exports for compatibility.
 *
 * Imports (per plan): Material, AgGrid, FormlyMaterial, Transloco — these
 * are all pulled in by the standalone components themselves via their
 * `imports: [...]` arrays.
 */
@NgModule({
  imports: [RouterModule.forChild(FORATION_ROUTES)],
})
export class ForationModule {}
