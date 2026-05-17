/**
 * CrusherSessionCompletedHandler unit tests (CON-01).
 *
 * Tests:
 *   1. append called once with correct payload for a fresh event
 *   2. Second call with same session_id is skipped (idempotent)
 *   3. Zero output_tonnage_kg skips the inflow
 */
import { CrusherSessionCompletedHandler, CrusherSessionCompletedPayload } from '../event-handlers/crusher-session-completed.handler';

const BASE_EVENT: CrusherSessionCompletedPayload = {
  session_id: 'crusher-session-001',
  tenant_id: 'tenant-001',
  site_id: 'site-001',
  operational_day_id: 'day-001',
  crusher_id: 'crusher-eq-001',
  output_stockpile_id: 'stockpile-001',
  output_tonnage_kg: 800,
  input_tonnage_kg: 1000,
  material_type: 'granite_brut',
  calibre_code: '0-31',
  energy_kwh: 150,
  operator_id: 'op-001',
  completed_at_utc: '2026-05-01T14:00:00.000Z',
};

describe('CrusherSessionCompletedHandler', () => {
  let handler: CrusherSessionCompletedHandler;
  let mockDs: { query: jest.Mock };
  let mockStockpileEvents: { append: jest.Mock };

  beforeEach(() => {
    mockStockpileEvents = { append: jest.fn().mockResolvedValue({ id: 'event-001' }) };
    mockDs = { query: jest.fn() };

    handler = new CrusherSessionCompletedHandler(mockDs as never, mockStockpileEvents as never);
  });

  it('calls append once with correct payload for a fresh event', async () => {
    // No existing row — fresh event
    mockDs.query.mockResolvedValueOnce([]);

    await handler.handle(BASE_EVENT);

    expect(mockStockpileEvents.append).toHaveBeenCalledTimes(1);
    const appendCall = mockStockpileEvents.append.mock.calls[0][0];
    expect(appendCall.stockpileId).toBe('stockpile-001');
    expect(appendCall.eventType).toBe('STOCKPILE_INFLOW');
    expect(appendCall.tonnageDeltaKg).toBe(800n);
    expect(appendCall.calibreCode).toBe('0-31');
    expect(appendCall.sourceReference.crusher_session_id).toBe('crusher-session-001');
    expect(appendCall.actorRole).toBe('SYSTEM_OUTBOX');
  });

  it('skips append when session_id already processed (idempotent)', async () => {
    // Existing row found — replay
    mockDs.query.mockResolvedValueOnce([{ id: 'event-existing-001' }]);

    await handler.handle(BASE_EVENT);

    expect(mockStockpileEvents.append).not.toHaveBeenCalled();
  });

  it('skips append when output_tonnage_kg is zero', async () => {
    mockDs.query.mockResolvedValueOnce([]); // No existing row

    await handler.handle({ ...BASE_EVENT, output_tonnage_kg: 0 });

    expect(mockStockpileEvents.append).not.toHaveBeenCalled();
  });

  it('re-throws on append failure (outbox worker will retry)', async () => {
    mockDs.query.mockResolvedValueOnce([]); // No existing row
    mockStockpileEvents.append.mockRejectedValueOnce(new Error('DB unique constraint violation'));

    await expect(handler.handle(BASE_EVENT)).rejects.toThrow('DB unique constraint violation');
  });
});
