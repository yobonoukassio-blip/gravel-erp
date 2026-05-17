/**
 * SyncController metric instrumentation tests (HRD-MVP-06 Task 4).
 *
 * Verifies SLO-B emission: sync_attempts_total increments exactly once per
 * request with the correct {tenant_id, result} label combo.
 */
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { getToken } from '@willsoto/nestjs-prometheus';
import { SyncController } from '../../../../src/modules/sync/sync.controller';

describe('SyncController — sync_attempts_total metric (SLO-B)', () => {
  let controller: SyncController;
  let counterInc: jest.Mock;
  let dsCreateQR: jest.Mock;

  const TENANT = '11111111-1111-1111-1111-111111111111';
  const SITE = '22222222-2222-2222-2222-222222222222';
  const USER = '33333333-3333-3333-3333-333333333333';
  const ID = '44444444-4444-4444-4444-444444444444';

  const mkMutation = () => ({
    id: ID,
    tenantId: TENANT,
    siteId: SITE,
    authorUserId: USER,
    capturedAtLocal: '2026-05-17T08:00:00',
    clientId: 'client-1',
    clientSeq: 1,
    notes: 'test',
  });

  beforeEach(async () => {
    counterInc = jest.fn();
    const queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([{ id: ID }]),
    };
    dsCreateQR = jest.fn(() => queryRunner);
    const dataSource = { createQueryRunner: dsCreateQR };

    const moduleRef = await Test.createTestingModule({
      controllers: [SyncController],
      providers: [
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: getToken('sync_attempts_total'), useValue: { inc: counterInc } },
      ],
    }).compile();

    controller = moduleRef.get(SyncController);
  });

  it('Test 1: success path increments counter with result=success', async () => {
    await controller.pushActivityLog({ mutations: [mkMutation()] });
    expect(counterInc).toHaveBeenCalledTimes(1);
    expect(counterInc).toHaveBeenCalledWith({ tenant_id: TENANT, result: 'success' });
  });

  it('Test 2: failure path (empty mutations) increments counter with result=failure and re-throws', async () => {
    await expect(controller.pushActivityLog({ mutations: [] })).rejects.toThrow(
      /mutations.*required/i,
    );
    expect(counterInc).toHaveBeenCalledTimes(1);
    expect(counterInc).toHaveBeenCalledWith({
      tenant_id: 'unknown',
      result: 'failure',
    });
  });

  it('Test 2b: failure path on validation error (oversized batch) still increments failure', async () => {
    const tooMany = Array.from({ length: 201 }, () => mkMutation());
    await expect(controller.pushActivityLog({ mutations: tooMany })).rejects.toThrow(
      /Batch too large/i,
    );
    expect(counterInc).toHaveBeenCalledTimes(1);
    expect(counterInc).toHaveBeenCalledWith({ tenant_id: TENANT, result: 'failure' });
  });
});
