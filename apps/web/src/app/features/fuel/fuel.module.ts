import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { FUEL_ROUTES } from './fuel-routes';

/**
 * FuelModule (CAR-01..CAR-04).
 *
 * Lazy-loads fuel management feature: tank list, deliveries, refuels, energy.
 * Each page is a standalone component.
 */
@NgModule({
  imports: [RouterModule.forChild(FUEL_ROUTES)],
})
export class FuelModule {}
