/**
 * REQ: FND-03 — Rôle scopé site (DIRECTION_GROUPE | DIRECTEUR_SITE | CHEF_CARRIERE |
 *               MAINTENANCE | HSE | FINANCE | OPERATEUR_TERRAIN).
 * Source: D-04.
 * Implementing plan: W1-P04 (identity: RBAC via @casl/ability + Keycloak groups).
 *
 * Wave 0 RED — assertions throw NOT IMPLEMENTED until the RBAC guards exist.
 */
import { GRAVEL_ROLES, type GravelRole } from '@gravel/shared-types';

describe('FND-03: RBAC role × site scoping', () => {
  it('exposes 7 canonical roles from D-04', () => {
    expect(GRAVEL_ROLES).toHaveLength(7);
    expect(GRAVEL_ROLES).toEqual(
      expect.arrayContaining<GravelRole>([
        'DIRECTION_GROUPE',
        'DIRECTEUR_SITE',
        'CHEF_CARRIERE',
        'MAINTENANCE',
        'HSE',
        'FINANCE',
        'OPERATEUR_TERRAIN',
      ]),
    );
  });

  it('CHEF_CARRIERE scoped to site-A cannot access site-B', () => {
    throw new Error('NOT IMPLEMENTED — plan W1-P04 (Identity RBAC via @casl/ability)');
  });

  it('DIRECTION_GROUPE with groupScope=group sees all sites of own tenant', () => {
    throw new Error('NOT IMPLEMENTED — plan W1-P04');
  });

  it('DIRECTION_GROUPE never sees sites of another tenant (RLS layer beneath RBAC)', () => {
    throw new Error('NOT IMPLEMENTED — plan W1-P04 + W1-P02 (RLS)');
  });
});
