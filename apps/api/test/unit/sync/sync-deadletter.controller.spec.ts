/**
 * Unit tests for SyncDeadletterController (HRD-MVP-07 — D-21).
 *
 * Verifies RBAC, tenant-scope enforcement, and the manual-replay contract
 * referenced by `.planning/runbooks/sync-deadletter-triage.md`.
 *
 * Controller is instantiated directly; the JwtAuthGuard is verified in its
 * own suite. Registry is mocked.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { GravelRole } from '@gravel/shared-types';
import {
  SyncDeadletterController,
  type DeadletterItem,
  type DeadletterRegistry,
} from '../../../src/modules/sync/sync-deadletter.controller';

interface AuthedRequest {
  user: { userId: string; tenantId: string; role: GravelRole };
}

function makeReq(role: GravelRole, tenantId = 'tenant-A'): AuthedRequest {
  return { user: { userId: 'user-1', tenantId, role } };
}

describe('SyncDeadletterController (HRD-MVP-07 D-21)', () => {
  let registry: jest.Mocked<DeadletterRegistry>;
  let controller: SyncDeadletterController;

  beforeEach(() => {
    registry = {
      findById: jest.fn(),
      markReplayed: jest.fn(),
    };
    controller = new SyncDeadletterController(registry);
  });

  it('Test 1: MAINTENANCE role + valid id returns { replayed: true, newAttemptId }', async () => {
    const item: DeadletterItem = { id: 'dl-1', tenantId: 'tenant-A', status: 'pending' };
    registry.findById.mockResolvedValue(item);
    registry.markReplayed.mockResolvedValue('attempt-xyz');

    const res = await controller.replay('dl-1', makeReq('MAINTENANCE'));

    expect(res).toEqual({ replayed: true, newAttemptId: 'attempt-xyz' });
    expect(registry.findById).toHaveBeenCalledWith('dl-1');
    expect(registry.markReplayed).toHaveBeenCalledWith('dl-1');
  });

  it('Test 2: caller without MAINTENANCE or DIRECTION_GROUPE role gets 403', async () => {
    await expect(controller.replay('dl-1', makeReq('OPERATEUR_TERRAIN'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(controller.replay('dl-1', makeReq('FINANCE'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // Registry is never touched on auth failure.
    expect(registry.findById).not.toHaveBeenCalled();
  });

  it('Test 3: replay with unknown id returns 404', async () => {
    registry.findById.mockResolvedValue(null);
    await expect(controller.replay('missing', makeReq('MAINTENANCE'))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(registry.markReplayed).not.toHaveBeenCalled();
  });

  it('Test 4: replay creates a new sync attempt via markReplayed (audit-visible side effect)', async () => {
    const item: DeadletterItem = { id: 'dl-2', tenantId: 'tenant-A', status: 'pending' };
    registry.findById.mockResolvedValue(item);
    registry.markReplayed.mockResolvedValue('attempt-2');

    const res = await controller.replay('dl-2', makeReq('MAINTENANCE'));

    expect(registry.markReplayed).toHaveBeenCalledTimes(1);
    expect(registry.markReplayed).toHaveBeenCalledWith('dl-2');
    expect(res.newAttemptId).toBe('attempt-2');
  });

  it('Test 5: tenant scope — MAINTENANCE cannot replay a deadletter from another tenant', async () => {
    const item: DeadletterItem = { id: 'dl-3', tenantId: 'tenant-B', status: 'pending' };
    registry.findById.mockResolvedValue(item);

    await expect(
      controller.replay('dl-3', makeReq('MAINTENANCE', 'tenant-A')),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(registry.markReplayed).not.toHaveBeenCalled();
  });

  it('Test 6: DIRECTION_GROUPE (group-scope / cross-tenant break-glass) may replay across tenants', async () => {
    const item: DeadletterItem = { id: 'dl-4', tenantId: 'tenant-B', status: 'pending' };
    registry.findById.mockResolvedValue(item);
    registry.markReplayed.mockResolvedValue('attempt-4');

    const res = await controller.replay(
      'dl-4',
      makeReq('DIRECTION_GROUPE', 'tenant-A'),
    );

    expect(res).toEqual({ replayed: true, newAttemptId: 'attempt-4' });
  });

  it('Test 7: unwired registry (no provider) returns 404 instead of crashing', async () => {
    const unwired = new SyncDeadletterController(undefined);
    await expect(unwired.replay('dl-x', makeReq('MAINTENANCE'))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
