import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Translation, TranslocoLoader } from '@jsverse/transloco';
import { Observable, forkJoin, map } from 'rxjs';

/**
 * Loads `assets/i18n/{lang}.json` (web-specific UI labels) and merges it with
 * `assets/i18n/labels-{lang}.json` (codegen'd from @gravel/i18n shared business
 * labels — see packages/i18n/codegen/generate-arb.ts).
 *
 * Falls back gracefully if the codegen'd file is absent (dev bootstrap).
 */
@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);

  getTranslation(lang: string): Observable<Translation> {
    return forkJoin({
      ui: this.http.get<Translation>(`/assets/i18n/${lang}.json`),
      labels: this.http
        .get<Translation>(`/assets/i18n/labels-${lang}.json`)
        // Tolerate missing shared-labels bundle.
        .pipe(map((x) => x, (() => ({}) as Translation))),
    }).pipe(map(({ ui, labels }) => ({ ...labels, ...ui })));
  }
}
