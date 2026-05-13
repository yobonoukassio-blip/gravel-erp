import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CONCASSAGE_ROUTES } from './concassage-routes';

/** ConcassageModule — thin lazy-loaded wrapper for standalone concassage/criblage components. */
@NgModule({
  imports: [RouterModule.forChild(CONCASSAGE_ROUTES)],
})
export class ConcassageModule {}
