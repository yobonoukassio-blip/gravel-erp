import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { TRANSPORT_ROUTES } from './transport-routes';

/**
 * TransportModule — thin lazy-loaded wrapper around the standalone
 * components in `./pages/*`. Plan acceptance references this symbol.
 * Angular 20 idiom prefers standalone routes (TRANSPORT_ROUTES); this
 * module simply re-exports them for compatibility with `loadChildren`.
 */
@NgModule({
  imports: [RouterModule.forChild(TRANSPORT_ROUTES)],
})
export class TransportModule {}
