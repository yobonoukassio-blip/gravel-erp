import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

export const DEFAULT_LOCALE = 'fr-CI';
export const SUPPORTED_LOCALES = ['fr-CI', 'en-CI', 'fr', 'en'] as const;

/**
 * Resolves the active locale for the current request, in priority order:
 *   1. CLS `preferredLocale` (mirrored from JWT by tenant-context.middleware)
 *   2. `Accept-Language` (not implemented here — Phase 1 keeps it simple)
 *   3. DEFAULT_LOCALE ('fr-CI')
 */
@Injectable()
export class LocaleResolver {
  constructor(private readonly cls: ClsService) {}

  resolve(): string {
    const fromCls = this.cls.get<string>('preferredLocale');
    if (fromCls && this.isSupported(fromCls)) return fromCls;
    return DEFAULT_LOCALE;
  }

  private isSupported(loc: string): boolean {
    return (SUPPORTED_LOCALES as readonly string[]).includes(loc);
  }
}
