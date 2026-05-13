import {
  provideTransloco,
  TranslocoConfig,
} from '@jsverse/transloco';
import { isDevMode } from '@angular/core';
import { TranslocoHttpLoader } from './transloco-http.loader';

export const TRANSLOCO_OPTIONS: Partial<TranslocoConfig> = {
  availableLangs: ['fr', 'en', 'ar'],
  defaultLang: 'fr',
  fallbackLang: 'fr',
  reRenderOnLangChange: true,
  prodMode: !isDevMode(),
};

export const provideAppTransloco = () =>
  provideTransloco({
    config: TRANSLOCO_OPTIONS,
    loader: TranslocoHttpLoader,
  });
