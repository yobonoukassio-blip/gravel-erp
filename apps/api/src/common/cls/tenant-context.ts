import { ClsService } from 'nestjs-cls';

/**
 * Typed CLS (Continuation-Local Storage) keys.
 * Set by AuthGuard / RequestId middleware (plan W1-P04), consumed by
 * TenantRlsSubscriber + TenantAwareRepository for every TypeORM query.
 *
 * Source: D-07 (defense in depth), RESEARCH.md Pattern 1.
 */
export const CLS_KEYS = {
  TENANT_ID: 'tenantId',
  USER_ID: 'userId',
  REQUEST_ID: 'requestId',
  SITE_IDS: 'siteIds',
  ROLE: 'role',
  BYPASS_RLS: 'bypassRls',
} as const;

export interface TenantContext {
  tenantId: string;
  userId?: string;
  requestId?: string;
  siteIds?: string[];
  role?: string;
  bypassRls?: boolean;
}

/**
 * Read the current request's tenant context from CLS. Returns undefined when
 * called outside a request scope (e.g. background job that must SET CONTEXT
 * explicitly).
 */
export function getTenantContext(cls: ClsService): TenantContext | undefined {
  const tenantId = cls.get<string>(CLS_KEYS.TENANT_ID);
  if (!tenantId) return undefined;
  return {
    tenantId,
    userId: cls.get<string>(CLS_KEYS.USER_ID),
    requestId: cls.get<string>(CLS_KEYS.REQUEST_ID),
    siteIds: cls.get<string[]>(CLS_KEYS.SITE_IDS),
    role: cls.get<string>(CLS_KEYS.ROLE),
    bypassRls: cls.get<boolean>(CLS_KEYS.BYPASS_RLS),
  };
}
