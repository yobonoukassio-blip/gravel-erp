import {
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { GravelRole } from '@gravel/shared-types';

/**
 * SyncDeadletterController — manual replay endpoint for sync deadletters
 * (HRD-MVP-07 D-21). Referenced by `.planning/runbooks/sync-deadletter-triage.md`.
 *
 * Concrete `DeadletterRegistry` implementation lands when the sync ingress
 * integration ships. Until then the controller injects the registry as
 * @Optional() — calls return 404 with a clear message instead of crashing,
 * preserving the SOP contract.
 */

/** Shape stored in the ConflictRegistry per HRD-MVP-07 D-21. */
export interface DeadletterItem {
  id: string;
  tenantId: string;
  status: 'pending' | 'replayed' | 'discarded';
}

/** Abstract registry the controller depends on. */
export interface DeadletterRegistry {
  findById(id: string): Promise<DeadletterItem | null>;
  /** Marks the item replayed and returns the new sync attempt id. */
  markReplayed(id: string): Promise<string>;
}

export const DEADLETTER_REGISTRY = Symbol('DEADLETTER_REGISTRY');

interface AuthedRequest {
  user: {
    userId: string;
    tenantId: string;
    role: GravelRole;
  };
}

/**
 * Roles permitted to replay sync deadletters.
 *
 * DEVIATION (Rule 3 — blocking type mismatch): the plan referenced
 * 'MAINTENANCE_MANAGER' and 'PLATFORM_ADMIN'. The shipped `GravelRole`
 * union (see packages/shared-types/src/jwt-claims.ts) does not include
 * those names; closest fit:
 *   MAINTENANCE_MANAGER → MAINTENANCE  (Chef Maintenance, site-scoped)
 *   PLATFORM_ADMIN      → DIRECTION_GROUPE  (group-scope, cross-tenant)
 * The SOP records this mapping. Rename when a dedicated PLATFORM_ADMIN
 * role is introduced.
 */
const REPLAY_ROLES: readonly GravelRole[] = ['MAINTENANCE', 'DIRECTION_GROUPE'];
const CROSS_TENANT_ROLES: readonly GravelRole[] = ['DIRECTION_GROUPE'];

@Controller('api/sync/deadletter')
@UseGuards(JwtAuthGuard)
export class SyncDeadletterController {
  constructor(
    @Optional()
    @Inject(DEADLETTER_REGISTRY)
    private readonly registry?: DeadletterRegistry,
  ) {}

  /**
   * POST /api/sync/deadletter/:id/replay
   *
   * Re-attempts a deadlettered sync write. Reserved for MAINTENANCE_MANAGER
   * and PLATFORM_ADMIN — see SOP §5. Enforces tenant scope: a manager can
   * only replay deadletters for their own tenant; PLATFORM_ADMIN may cross
   * tenants for break-glass recovery.
   */
  @Post(':id/replay')
  @HttpCode(HttpStatus.OK)
  async replay(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
  ): Promise<{ replayed: boolean; newAttemptId: string }> {
    const role = req.user.role;
    if (!REPLAY_ROLES.includes(role)) {
      throw new ForbiddenException(
        'Requires MAINTENANCE (Chef Maintenance) or DIRECTION_GROUPE to replay sync deadletters',
      );
    }

    if (!this.registry) {
      // Graceful degradation: SOP can reference the endpoint; integration
      // wiring (real ConflictRegistry persistence) ships when the PowerSync
      // ingress is migrated. Documented in SUMMARY "Known Stubs".
      throw new NotFoundException(
        'Deadletter registry not yet wired — see apps/api/src/modules/sync/sync.module.ts setup',
      );
    }

    const item = await this.registry.findById(id);
    if (!item) {
      throw new NotFoundException(`Deadletter ${id} not found`);
    }

    const isCrossTenant = CROSS_TENANT_ROLES.includes(role);
    if (!isCrossTenant && item.tenantId !== req.user.tenantId) {
      throw new ForbiddenException('Tenant scope violation');
    }

    const newAttemptId = await this.registry.markReplayed(id);
    return { replayed: true, newAttemptId };
  }
}
