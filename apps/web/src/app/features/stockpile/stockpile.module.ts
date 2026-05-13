import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { STOCKPILE_ROUTES } from './stockpile-routes';

/** StockpileModule — thin lazy-loaded wrapper for standalone stockpile components. */
@NgModule({
  imports: [RouterModule.forChild(STOCKPILE_ROUTES)],
})
export class StockpileModule {}
