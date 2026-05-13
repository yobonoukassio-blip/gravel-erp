import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { DASHBOARD_ROUTES } from './dashboard-routes';

/**
 * DashboardSiteModule (DSH-01).
 *
 * Lazy shell module for both site director and quarry chief dashboards.
 * Components are standalone — this module only handles routing registration.
 */
@NgModule({
  imports: [RouterModule.forChild(DASHBOARD_ROUTES)],
})
export class DashboardSiteModule {}
