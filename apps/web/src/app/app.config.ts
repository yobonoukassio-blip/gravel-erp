import {
  ApplicationConfig,
  importProvidersFrom,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import {
  provideHttpClient,
  withInterceptors,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { AuthModule, authInterceptor } from 'angular-auth-oidc-client';
import { FormlyModule } from '@ngx-formly/core';
import { FormlyMaterialModule } from '@ngx-formly/material';
import { GpsPickerLeafletType } from './shared/formly/gps-picker-leaflet.type';
import { PolygonPickerLeafletType } from './shared/formly/polygon-picker-leaflet.type';

import { routes } from './app.routes';
import { oidcConfig } from './core/auth/oidc.config';
import { provideAppTransloco } from './core/i18n/transloco.config';
import { startWebOtel } from './core/otel/otel';
import { silentErrorInterceptor } from './core/http/silent-error.interceptor';

// Start OTel BEFORE the Angular bootstrap so the document-load instrumentation
// captures the cold-start span. Idempotent on repeat calls (HMR / SSR replay).
startWebOtel();

/**
 * Application config. Wires:
 *   - Router (lazy routes)
 *   - HttpClient + OIDC interceptor (attaches access token to /api calls)
 *   - angular-auth-oidc-client AuthModule
 *   - Transloco (FR/EN, loaded from /assets/i18n/)
 *   - Material animations (async)
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptorsFromDi(), withInterceptors([authInterceptor(), silentErrorInterceptor])),
    provideAnimationsAsync(),
    importProvidersFrom(AuthModule.forRoot({ config: oidcConfig })),
    importProvidersFrom(
      FormlyModule.forRoot({
        types: [
          { name: 'gps-picker-leaflet', component: GpsPickerLeafletType },
          { name: 'polygon-picker-leaflet', component: PolygonPickerLeafletType },
        ],
      }),
      FormlyMaterialModule,
    ),
    provideAppTransloco(),
  ],
};
