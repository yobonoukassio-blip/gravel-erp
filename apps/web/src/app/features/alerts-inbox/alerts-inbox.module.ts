import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ALERTS_ROUTES } from './alerts-routes';

/**
 * AlertsInboxModule (DSH-01, D2-74).
 *
 * Lazy shell module for the alerts inbox feature. Components are
 * standalone — this module exists to register routes and act as a
 * lazy boundary.
 */
@NgModule({
  imports: [RouterModule.forChild(ALERTS_ROUTES)],
})
export class AlertsInboxModule {}
