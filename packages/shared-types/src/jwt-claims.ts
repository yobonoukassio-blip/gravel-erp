/**
 * JWT claim shape — Source: D-04 (Phase 1 CONTEXT.md).
 * Keycloak realm `gravel-dev` issues access tokens carrying these claims.
 */

export type GravelRole =
  | 'DIRECTION_GROUPE'
  | 'DIRECTEUR_SITE'
  | 'CHEF_CARRIERE'
  | 'MAINTENANCE'
  | 'HSE'
  | 'FINANCE'
  | 'OPERATEUR_TERRAIN';

export const GRAVEL_ROLES: readonly GravelRole[] = [
  'DIRECTION_GROUPE',
  'DIRECTEUR_SITE',
  'CHEF_CARRIERE',
  'MAINTENANCE',
  'HSE',
  'FINANCE',
  'OPERATEUR_TERRAIN',
] as const;

/**
 * `groupScope='group'` ⇒ user (typically DIRECTION_GROUPE) sees all sites of their tenant.
 * `groupScope=null` ⇒ user is scoped strictly to the sites listed in `siteIds`.
 */
export interface JwtClaims {
  userId: string;
  tenantId: string;
  siteIds: string[];
  role: GravelRole;
  groupScope: 'group' | null;
  preferredLocale: string;
}
