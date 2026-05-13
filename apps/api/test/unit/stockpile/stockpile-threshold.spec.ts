/**
 * StockpileThresholdService unit tests — STK-02 (alert emission + dedupe).
 *
 * Verifies edge-triggered crossing semantics: only the *first* event that
 * crosses a threshold downward emits; subsequent events that stay on the
 * same side do not.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StockpileThresholdService } from '../../../src/modules/stockpile/services/stockpile-threshold.service';

class FakeDs {
  low = 2000n;
  criticalLow = 500n;
  high = 100000n;

  async query(_sql: string, _params: unknown[]): Promise<unknown[]> {
    return [
      {
        critical_low_kg: this.criticalLow.toString(),
        low_kg: this.low.toString(),
        high_kg: this.high.toString(),
      },
    ];
  }
}

function makeSvc(): {
  svc: StockpileThresholdService;
  events: EventEmitter2;
  emitted: Array<{ type: string; payload: unknown }>;
} {
  const ds = new FakeDs();
  const events = new EventEmitter2();
  const emitted: Array<{ type: string; payload: unknown }> = [];
  events.on('production.stockpile.threshold_crossed', (p) =>
    emitted.push({ type: 'crossed', payload: p }),
  );
  const svc = new StockpileThresholdService(ds as unknown as never, events);
  return { svc, events, emitted };
}

describe('StockpileThresholdService.checkCrossing (STK-02)', () => {
  it('crossing low downward emits one "low" event', async () => {
    const { svc, emitted } = makeSvc();
    await svc.checkCrossing({
      tenantId: 't1',
      siteId: 's1',
      stockpileId: 'sp1',
      calibreCode: '0-31_5',
      oldBalanceKg: 5000n,
      newBalanceKg: 1500n,
    });
    expect(emitted.length).toBe(1);
    const p = emitted[0].payload as { thresholdType: string; severity: string };
    expect(p.thresholdType).toBe('low');
    expect(p.severity).toBe('high');
  });

  it('crossing critical_low downward emits "critical_low" with severity=critical', async () => {
    const { svc, emitted } = makeSvc();
    await svc.checkCrossing({
      tenantId: 't1',
      siteId: 's1',
      stockpileId: 'sp1',
      calibreCode: '0-31_5',
      oldBalanceKg: 1500n,
      newBalanceKg: 400n,
    });
    expect(emitted.length).toBe(1);
    const p = emitted[0].payload as { thresholdType: string; severity: string };
    expect(p.thresholdType).toBe('critical_low');
    expect(p.severity).toBe('critical');
  });

  it('no spam: staying below low after crossing emits nothing', async () => {
    const { svc, emitted } = makeSvc();
    // Already below low (no crossing edge): old 1500, new 1300 → nothing.
    await svc.checkCrossing({
      tenantId: 't1',
      siteId: 's1',
      stockpileId: 'sp1',
      calibreCode: '0-31_5',
      oldBalanceKg: 1500n,
      newBalanceKg: 1300n,
    });
    expect(emitted.length).toBe(0);
  });

  it('crossing high upward emits "high" event', async () => {
    const { svc, emitted } = makeSvc();
    await svc.checkCrossing({
      tenantId: 't1',
      siteId: 's1',
      stockpileId: 'sp1',
      calibreCode: '0-31_5',
      oldBalanceKg: 90000n,
      newBalanceKg: 110000n,
    });
    expect(emitted.length).toBe(1);
    const p = emitted[0].payload as { thresholdType: string };
    expect(p.thresholdType).toBe('high');
  });

  it('canonical plan scenario: INFLOW 5000 → OUT -3500 (cross low) → OUT -1000 (cross critical) → OUT -200 (no event)', async () => {
    const { svc, emitted } = makeSvc();
    // Step 1: balance 0 → 5000 (above thresholds, no crossing)
    await svc.checkCrossing({
      tenantId: 't1',
      siteId: 's1',
      stockpileId: 'sp1',
      calibreCode: '0-31_5',
      oldBalanceKg: 0n,
      newBalanceKg: 5000n,
    });
    expect(emitted.length).toBe(0);

    // Step 2: balance 5000 → 1500 (crosses low at 2000)
    await svc.checkCrossing({
      tenantId: 't1',
      siteId: 's1',
      stockpileId: 'sp1',
      calibreCode: '0-31_5',
      oldBalanceKg: 5000n,
      newBalanceKg: 1500n,
    });
    expect(emitted.length).toBe(1);

    // Step 3: balance 1500 → 500 (crosses critical_low at 500)
    await svc.checkCrossing({
      tenantId: 't1',
      siteId: 's1',
      stockpileId: 'sp1',
      calibreCode: '0-31_5',
      oldBalanceKg: 1500n,
      newBalanceKg: 400n,
    });
    expect(emitted.length).toBe(2);
    expect((emitted[1].payload as { thresholdType: string }).thresholdType).toBe('critical_low');

    // Step 4: balance 400 → 200 (still below critical_low; no new crossing)
    await svc.checkCrossing({
      tenantId: 't1',
      siteId: 's1',
      stockpileId: 'sp1',
      calibreCode: '0-31_5',
      oldBalanceKg: 400n,
      newBalanceKg: 200n,
    });
    expect(emitted.length).toBe(2);
  });
});
