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
  | 'OPERATEUR_TERRAIN'
  // Phase 2 roles (D2-110)
  | 'OPERATOR_DRILLING'
  | 'OPERATOR_EXCAVATOR'
  | 'TRUCK_DRIVER'
  | 'WEIGHING_OPERATOR'
  | 'HSE_OFFICER'
  | 'SITE_MANAGER'
  | 'QUARRY_CHIEF'
  // Phase 3 roles
  | 'PROCESSING_OPERATOR'
  | 'SALES_MANAGER'
  | 'MAINTENANCE_TECH';

export const GRAVEL_ROLES: readonly GravelRole[] = [
  'DIRECTION_GROUPE',
  'DIRECTEUR_SITE',
  'CHEF_CARRIERE',
  'MAINTENANCE',
  'HSE',
  'FINANCE',
  'OPERATEUR_TERRAIN',
  'OPERATOR_DRILLING',
  'OPERATOR_EXCAVATOR',
  'TRUCK_DRIVER',
  'WEIGHING_OPERATOR',
  'HSE_OFFICER',
  'SITE_MANAGER',
  'QUARRY_CHIEF',
  'PROCESSING_OPERATOR',
  'SALES_MANAGER',
  'MAINTENANCE_TECH',
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
