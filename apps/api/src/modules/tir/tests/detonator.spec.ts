import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DetonatorService } from '../services/detonator.service';

/**
 * TIR-02 detonator lifecycle spec.
 * Uses a mocked DataSource to exercise service state machine logic.
 */
describe('DetonatorService (TIR-02)', () => {
  let service: DetonatorService;
  let mockDs: { query: jest.Mock };

  const TENANT = 'tenant-abc';
  const SERIAL = 'DET-2026-001';
  const EVENT_ID = 'evt-in-001';
  const CHARGE_ID = 'charge-001';

  function makeDetonator(
    overrides: Partial<Record<string, unknown>> = {},
  ): Record<string, unknown> {
    return {
      id: 'det-uuid-1',
      tenant_id: TENANT,
      serial_number: SERIAL,
      status: 'IN_STOCK',
      received_in_event_id: EVENT_ID,
      blast_charge_id: null,
      destroyed_at_utc: null,
      created_at_utc: new Date().toISOString(),
      ...overrides,
    };
  }

  beforeEach(() => {
    mockDs = { query: jest.fn() };
    service = new DetonatorService(mockDs as never);
  });

  describe('receiveFromEvent', () => {
    it('creates a detonator in IN_STOCK status', async () => {
      mockDs.query.mockResolvedValueOnce([makeDetonator()]);
      const det = await service.receiveFromEvent(SERIAL, EVENT_ID, TENANT);
      expect(det.status).toBe('IN_STOCK');
      expect(det.serialNumber).toBe(SERIAL);
      expect(det.blastChargeId).toBeNull();
    });
  });

  describe('load — IN_STOCK → LOADED', () => {
    it('transitions successfully', async () => {
      mockDs.query
        .mockResolvedValueOnce([makeDetonator()]) // findBySerial
        .mockResolvedValueOnce([makeDetonator({ status: 'LOADED', blast_charge_id: CHARGE_ID })]); // update
      const det = await service.load(SERIAL, CHARGE_ID, TENANT);
      expect(det.status).toBe('LOADED');
      expect(det.blastChargeId).toBe(CHARGE_ID);
    });

    it('throws ERR_DETONATOR_INVALID_TRANSITION when already FIRED', async () => {
      mockDs.query.mockResolvedValueOnce([makeDetonator({ status: 'FIRED' })]);
      await expect(service.load(SERIAL, CHARGE_ID, TENANT)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('fire — LOADED → FIRED', () => {
    it('transitions successfully', async () => {
      mockDs.query
        .mockResolvedValueOnce([makeDetonator({ status: 'LOADED' })])
        .mockResolvedValueOnce([makeDetonator({ status: 'FIRED' })]);
      const det = await service.fire(SERIAL, TENANT);
      expect(det.status).toBe('FIRED');
    });

    it('throws when not LOADED', async () => {
      mockDs.query.mockResolvedValueOnce([makeDetonator({ status: 'IN_STOCK' })]);
      await expect(service.fire(SERIAL, TENANT)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('return — LOADED → RETURNED', () => {
    it('transitions successfully', async () => {
      mockDs.query
        .mockResolvedValueOnce([makeDetonator({ status: 'LOADED' })])
        .mockResolvedValueOnce([makeDetonator({ status: 'RETURNED' })]);
      const det = await service.return(SERIAL, TENANT);
      expect(det.status).toBe('RETURNED');
    });
  });

  describe('destroy', () => {
    it('transitions IN_STOCK → DESTROYED', async () => {
      const destroyedAt = new Date().toISOString();
      mockDs.query
        .mockResolvedValueOnce([makeDetonator()])
        .mockResolvedValueOnce([makeDetonator({ status: 'DESTROYED', destroyed_at_utc: destroyedAt })]);
      const det = await service.destroy(SERIAL, TENANT);
      expect(det.status).toBe('DESTROYED');
      expect(det.destroyedAtUtc).not.toBeNull();
    });

    it('throws ERR_DETONATOR_FIRED_FINAL when trying to destroy a FIRED detonator', async () => {
      mockDs.query.mockResolvedValueOnce([makeDetonator({ status: 'FIRED' })]);
      await expect(service.destroy(SERIAL, TENANT)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('findBySerial', () => {
    it('throws NotFoundException when serial not found', async () => {
      mockDs.query.mockResolvedValueOnce([]);
      await expect(service.findBySerial('UNKNOWN', TENANT)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('full lifecycle IN_STOCK → LOADED → FIRED', () => {
    it('traverses all three statuses without error', async () => {
      const inStock = makeDetonator({ status: 'IN_STOCK' });
      const loaded = makeDetonator({ status: 'LOADED', blast_charge_id: CHARGE_ID });
      const fired = makeDetonator({ status: 'FIRED', blast_charge_id: CHARGE_ID });

      // receive
      mockDs.query.mockResolvedValueOnce([inStock]);
      const det1 = await service.receiveFromEvent(SERIAL, EVENT_ID, TENANT);
      expect(det1.status).toBe('IN_STOCK');

      // load
      mockDs.query
        .mockResolvedValueOnce([inStock]) // findBySerial
        .mockResolvedValueOnce([loaded]);  // update
      const det2 = await service.load(SERIAL, CHARGE_ID, TENANT);
      expect(det2.status).toBe('LOADED');

      // fire
      mockDs.query
        .mockResolvedValueOnce([loaded]) // findBySerial
        .mockResolvedValueOnce([fired]);  // update
      const det3 = await service.fire(SERIAL, TENANT);
      expect(det3.status).toBe('FIRED');
    });
  });

  describe('duplicate serial constraint', () => {
    it('propagates DB unique constraint error on duplicate serial per tenant', async () => {
      const dbError = new Error('duplicate key value violates unique constraint "detonator_tenant_id_serial_number_key"');
      mockDs.query.mockRejectedValueOnce(dbError);
      await expect(
        service.receiveFromEvent(SERIAL, EVENT_ID, TENANT),
      ).rejects.toThrow('duplicate key');
    });
  });
});
