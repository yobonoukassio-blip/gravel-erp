import { IsIn, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Body of `PUT /api/users/me/preferences`.
 * Source: D-32 (preferred_locale per user) + FND-09.
 *
 * Phase 1 supports only `key: 'locale'`. The shape is kept extensible
 * (`{key, value}`) so future preference keys (theme, default site, etc.)
 * can be added without breaking the contract.
 */
export class UpdatePreferencesDto {
  @IsString()
  @IsIn(['locale'])
  key!: 'locale';

  @IsString()
  @MaxLength(20)
  // Accept locale tags like 'fr', 'fr-CI', 'en-US'.
  @Matches(/^[a-z]{2}(-[A-Z]{2})?$/)
  value!: string;
}
