import { Module } from '@nestjs/common';
import { LocaleResolver } from './locale.resolver';

/**
 * Light-touch i18n module: resolves the active locale from the calling user's
 * `preferred_locale` (via CLS) and exposes it to anywhere that needs to render
 * server-side localized strings. UI translations live in apps/web + apps/mobile.
 */
@Module({
  providers: [LocaleResolver],
  exports: [LocaleResolver],
})
export class I18nModule {}
