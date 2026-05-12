/**
 * REQ: FND-03 — Rôle scopé site (7 roles per D-04).
 * Source: D-04, plan W2-P04.
 *
 * Unit-tests SiteScopeGuard + RoleGuard directly with mocked ClsService and
 * Reflector — no Nest application boot required.
 */
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { GRAVEL_ROLES, type GravelRole } from '@gravel/shared-types';
import { SiteScopeGuard, SITE_PARAM_KEY } from '../../src/common/guards/site-scope.guard';
import { RoleGuard, ROLES_KEY } from '../../src/modules/identity/role.decorator';
import { CLS_KEYS } from '../../src/common/cls/tenant-context';

function mockCls(state: Record<string, unknown>): ClsService {
  return {
    get: <T>(k: string) => state[k] as T,
    set: jest.fn(),
  } as unknown as ClsService;
}

function mockReflector(map: Record<string, unknown>): Reflector {
  return {
    getAllAndOverride: <T>(key: string) => map[key] as T,
  } as unknown as Reflector;
}

function mockCtx(
  params: Record<string, string>,
  method = 'GET',
  body: Record<string, unknown> = {},
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ params, body, method }),
    }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('FND-03 — RBAC role × site scoping', () => {
  describe('roles catalogue', () => {
    it('exposes exactly 7 canonical roles from D-04', () => {
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
  });

  describe('SiteScopeGuard', () => {
    it('CHEF_CARRIERE scoped to site-A cannot access site-B (mutating)', () => {
      const cls = mockCls({
        [CLS_KEYS.SITE_IDS]: ['site-A'],
        [CLS_KEYS.ROLE]: 'CHEF_CARRIERE',
        groupScope: null,
      });
      const reflector = mockReflector({ [SITE_PARAM_KEY]: 'siteId' });
      const guard = new SiteScopeGuard(cls, reflector);
      const ctx = mockCtx({ siteId: 'site-B' }, 'POST');
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('CHEF_CARRIERE scoped to site-A can access site-A', () => {
      const cls = mockCls({
        [CLS_KEYS.SITE_IDS]: ['site-A'],
        [CLS_KEYS.ROLE]: 'CHEF_CARRIERE',
        groupScope: null,
      });
      const reflector = mockReflector({ [SITE_PARAM_KEY]: 'siteId' });
      const guard = new SiteScopeGuard(cls, reflector);
      expect(guard.canActivate(mockCtx({ siteId: 'site-A' }, 'GET'))).toBe(true);
    });

    it('DIRECTION_GROUPE with groupScope=group reads any site of own tenant (READ)', () => {
      const cls = mockCls({
        [CLS_KEYS.SITE_IDS]: [],
        [CLS_KEYS.ROLE]: 'DIRECTION_GROUPE',
        groupScope: 'group',
      });
      const reflector = mockReflector({ [SITE_PARAM_KEY]: 'siteId' });
      const guard = new SiteScopeGuard(cls, reflector);
      expect(guard.canActivate(mockCtx({ siteId: 'site-X' }, 'GET'))).toBe(true);
    });

    it('DIRECTION_GROUPE with groupScope=group still cannot MUTATE arbitrary sites', () => {
      const cls = mockCls({
        [CLS_KEYS.SITE_IDS]: [],
        [CLS_KEYS.ROLE]: 'DIRECTION_GROUPE',
        groupScope: 'group',
      });
      const reflector = mockReflector({ [SITE_PARAM_KEY]: 'siteId' });
      const guard = new SiteScopeGuard(cls, reflector);
      expect(() => guard.canActivate(mockCtx({ siteId: 'site-X' }, 'POST'))).toThrow(
        ForbiddenException,
      );
    });

    it('falls through (returns true) when route has no site param', () => {
      const cls = mockCls({ [CLS_KEYS.SITE_IDS]: [] });
      const reflector = mockReflector({ [SITE_PARAM_KEY]: 'siteId' });
      const guard = new SiteScopeGuard(cls, reflector);
      expect(guard.canActivate(mockCtx({}, 'GET'))).toBe(true);
    });
  });

  describe('RoleGuard', () => {
    it('@Role(FINANCE) — rejects non-FINANCE caller', () => {
      const cls = mockCls({ [CLS_KEYS.ROLE]: 'CHEF_CARRIERE' });
      const reflector = mockReflector({ [ROLES_KEY]: ['FINANCE'] as GravelRole[] });
      const guard = new RoleGuard(cls, reflector);
      expect(() => guard.canActivate(mockCtx({}))).toThrow(ForbiddenException);
    });

    it('@Role(FINANCE) — accepts FINANCE caller', () => {
      const cls = mockCls({ [CLS_KEYS.ROLE]: 'FINANCE' });
      const reflector = mockReflector({ [ROLES_KEY]: ['FINANCE'] as GravelRole[] });
      const guard = new RoleGuard(cls, reflector);
      expect(guard.canActivate(mockCtx({}))).toBe(true);
    });

    it('No @Role decorator — open route', () => {
      const cls = mockCls({ [CLS_KEYS.ROLE]: 'OPERATEUR_TERRAIN' });
      const reflector = mockReflector({});
      const guard = new RoleGuard(cls, reflector);
      expect(guard.canActivate(mockCtx({}))).toBe(true);
    });

    it('each of 7 roles × 2 sites: assertion matrix', () => {
      for (const role of GRAVEL_ROLES) {
        for (const site of ['site-A', 'site-B']) {
          const allowed = ['site-A'];
          const cls = mockCls({
            [CLS_KEYS.SITE_IDS]: allowed,
            [CLS_KEYS.ROLE]: role,
            groupScope: role === 'DIRECTION_GROUPE' ? 'group' : null,
          });
          const reflector = mockReflector({ [SITE_PARAM_KEY]: 'siteId' });
          const guard = new SiteScopeGuard(cls, reflector);
          const ctx = mockCtx({ siteId: site }, 'GET');
          if (allowed.includes(site) || role === 'DIRECTION_GROUPE') {
            expect(guard.canActivate(ctx)).toBe(true);
          } else {
            expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
          }
        }
      }
    });
  });
});
