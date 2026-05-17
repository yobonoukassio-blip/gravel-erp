/**
 * ScreeningSessionCompletedHandler unit tests (CRI-01).
 *
 * Tests:
 *   1. 3 calibres → append called 3 times with correct compound idempotency keys
 *   2. Full replay (all 3 calibres present) → 0 new appends
 *   3. Partial replay (1 of 3 calibres present) → 2 new appends
 *   4. Zero tonnage_kg calibre is skipped
 *
 * Pitfall 3: compound key is `${session_id}_${calibre_code}`, NOT just session_id.
 */
import { ScreeningSessionCompletedHandler, ScreeningSessionCompletedPayload } from '../event-handlers/screening-session-completed.handler';

const THREE_CALIBRE_EVENT: ScreeningSessionCompletedPayload = {
  session_id: 'screen-session-001',
  tenant_id: 'tenant-001',
  site_id: 'site-001',
  operational_day_id: 'day-001',
  screen_id: 'screen-eq-001',
  input_tonnage_kg: 700,
  calibre_yields: [
    { calibre_code: '0-4',   output_stockpile_id: 'sp-001', tonnage_kg: 200, is_nonconforming: false, nonconformity_reason: null },
    { calibre_code: '4-16',  output_stockpile_id: 'sp-002', tonnage_kg: 350, is_nonconforming: false, nonconformity_reason: null },
    { calibre_code: '16-31', output_stockpile_id: 'sp-003', tonnage_kg: 150, is_nonconforming: true, nonconformity_reason: 'Surdimensionné détecté' },
  ],
  operator_id: 'op-001',
  completed_at_utc: '2026-05-01T14:00:00.000Z',
};

describe('ScreeningSessionCompletedHandler', () => {
  let handler: ScreeningSessionCompletedHandler;
  let mockDs: { query: jest.Mock };
  let mockStockpileEvents: { append: jest.Mock };

  beforeEach(() => {
    mockStockpileEvents = { append: jest.fn().mockResolvedValue({ id: 'event-001' }) };
    mockDs = { query: jest.fn() };

    handler = new ScreeningSessionCompletedHandler(mockDs as never, mockStockpileEvents as never);
  });

  it('calls append 3 times with correct compound idempotency keys', async () => {
    // All 3 calibres are new
    mockDs.query
      .mockResolvedValueOnce([]) // 0-4: not present
      .mockResolvedValueOnce([]) // 4-16: not present
      .mockResolvedValueOnce([]); // 16-31: not present

    await handler.handle(THREE_CALIBRE_EVENT);

    expect(mockStockpileEvents.append).toHaveBeenCalledTimes(3);

    const calls = mockStockpileEvents.append.mock.calls;

    // Verify compound idempotency keys
    expect(calls[0][0].sourceReference.screening_idempotency_key).toBe('screen-session-001_0-4');
    expect(calls[1][0].sourceReference.screening_idempotency_key).toBe('screen-session-001_4-16');
    expect(calls[2][0].sourceReference.screening_idempotency_key).toBe('screen-session-001_16-31');

    // Verify session_id is also in source_reference
    for (const call of calls) {
      expect(call[0].sourceReference.session_id).toBe('screen-session-001');
    }
  });

  it('calls append with correct stockpile_ids per calibre', async () => {
    mockDs.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await handler.handle(THREE_CALIBRE_EVENT);

    const calls = mockStockpileEvents.append.mock.calls;
    expect(calls[0][0].stockpileId).toBe('sp-001');
    expect(calls[0][0].tonnageDeltaKg).toBe(200n);
    expect(calls[1][0].stockpileId).toBe('sp-002');
    expect(calls[1][0].tonnageDeltaKg).toBe(350n);
    expect(calls[2][0].stockpileId).toBe('sp-003');
    expect(calls[2][0].tonnageDeltaKg).toBe(150n);
  });

  it('full replay: all 3 calibres already present → 0 new appends', async () => {
    // All 3 calibres found in existing rows
    mockDs.query
      .mockResolvedValueOnce([{ id: 'event-001' }]) // 0-4: already present
      .mockResolvedValueOnce([{ id: 'event-002' }]) // 4-16: already present
      .mockResolvedValueOnce([{ id: 'event-003' }]); // 16-31: already present

    await handler.handle(THREE_CALIBRE_EVENT);

    expect(mockStockpileEvents.append).not.toHaveBeenCalled();
  });

  it('partial replay: 1 of 3 calibres present → 2 new appends', async () => {
    // Only the first calibre was already processed
    mockDs.query
      .mockResolvedValueOnce([{ id: 'event-001' }]) // 0-4: already present — skip
      .mockResolvedValueOnce([])                     // 4-16: new — append
      .mockResolvedValueOnce([]);                    // 16-31: new — append

    await handler.handle(THREE_CALIBRE_EVENT);

    expect(mockStockpileEvents.append).toHaveBeenCalledTimes(2);

    // The two new calibres should be 4-16 and 16-31
    const keys = mockStockpileEvents.append.mock.calls.map(
      (c: [{ sourceReference: { screening_idempotency_key: string } }]) =>
        c[0].sourceReference.screening_idempotency_key,
    );
    expect(keys).toContain('screen-session-001_4-16');
    expect(keys).toContain('screen-session-001_16-31');
    expect(keys).not.toContain('screen-session-001_0-4');
  });

  it('skips calibres with zero tonnage_kg', async () => {
    const eventWithZero: ScreeningSessionCompletedPayload = {
      ...THREE_CALIBRE_EVENT,
      calibre_yields: [
        { calibre_code: '0-4', output_stockpile_id: 'sp-001', tonnage_kg: 0, is_nonconforming: false, nonconformity_reason: null },
        { calibre_code: '4-16', output_stockpile_id: 'sp-002', tonnage_kg: 350, is_nonconforming: false, nonconformity_reason: null },
      ],
    };

    mockDs.query
      .mockResolvedValueOnce([]) // 0-4: not present but zero tonnage
      .mockResolvedValueOnce([]); // 4-16: not present

    await handler.handle(eventWithZero);

    // Only 4-16 appended — 0-4 skipped due to zero tonnage
    expect(mockStockpileEvents.append).toHaveBeenCalledTimes(1);
    expect(mockStockpileEvents.append.mock.calls[0][0].calibreCode).toBe('4-16');
  });

  it('re-throws on append failure so outbox worker retries (already-done calibres are idempotent)', async () => {
    mockDs.query
      .mockResolvedValueOnce([]) // 0-4: new
      .mockResolvedValueOnce([]); // queried before the failing append

    mockStockpileEvents.append
      .mockResolvedValueOnce({ id: 'event-001' }) // 0-4 succeeds
      .mockRejectedValueOnce(new Error('DB unique constraint')); // 4-16 fails

    await expect(handler.handle(THREE_CALIBRE_EVENT)).rejects.toThrow('DB unique constraint');
    // On retry, 0-4 will have an existing row → skipped; 4-16 retried.
  });
});
