import { SseBroadcasterService } from '../services/sse-broadcaster.service';
import { DashboardProjectionHandler } from '../event-handlers/dashboard-projection.handler';

// ---------------------------------------------------------------------------
// Mock Response factory
// ---------------------------------------------------------------------------

function makeMockRes(): {
  write: jest.Mock;
  writtenChunks: string[];
} {
  const writtenChunks: string[] = [];
  const write = jest.fn((chunk: string) => {
    writtenChunks.push(chunk);
    return true;
  });
  return { write, writtenChunks };
}

// ---------------------------------------------------------------------------
// SseBroadcasterService unit tests
// ---------------------------------------------------------------------------

describe('SseBroadcasterService', () => {
  let svc: SseBroadcasterService;

  beforeEach(() => {
    svc = new SseBroadcasterService();
  });

  it('registers a client and emits an event in SSE format', () => {
    const res = makeMockRes();
    svc.register('tenant1:site1:site-director', res as never);

    svc.emit('tenant1:site1:site-director', { kind: 'kpi.delta', updated_keys: ['stockpiles'] });

    expect(res.writtenChunks).toHaveLength(1);
    const chunk = res.writtenChunks[0];
    expect(chunk).toMatch(/^id: 1\n/);
    expect(chunk).toContain('data: ');
    expect(chunk).toContain('kpi.delta');
    expect(chunk).toEndWith('\n\n');
  });

  it('broadcasts to multiple subscribers on same channel', () => {
    const res1 = makeMockRes();
    const res2 = makeMockRes();
    svc.register('t:s:site-director', res1 as never);
    svc.register('t:s:site-director', res2 as never);

    svc.emit('t:s:site-director', { kind: 'test' });

    expect(res1.writtenChunks).toHaveLength(1);
    expect(res2.writtenChunks).toHaveLength(1);
  });

  it('does not emit to unregistered channels', () => {
    const res = makeMockRes();
    svc.register('t:s:site-director', res as never);

    svc.emit('t:s:quarry-chief', { kind: 'test' });

    expect(res.writtenChunks).toHaveLength(0);
  });

  it('unregisters a client — no further events received', () => {
    const res = makeMockRes();
    svc.register('t:s:site-director', res as never);
    svc.unregister('t:s:site-director', res as never);

    svc.emit('t:s:site-director', { kind: 'test' });

    expect(res.writtenChunks).toHaveLength(0);
  });

  it('replays buffered events on reconnect with Last-Event-ID', () => {
    const res1 = makeMockRes();
    svc.register('t:s:site-director', res1 as never);

    // Emit 3 events
    svc.emit('t:s:site-director', { kind: 'ev1' });
    svc.emit('t:s:site-director', { kind: 'ev2' });
    svc.emit('t:s:site-director', { kind: 'ev3' });

    // Reconnect after event 1 — should replay ev2, ev3
    const res2 = makeMockRes();
    svc.register('t:s:site-director', res2 as never, '1');

    // res2 should have received 2 replayed events at registration time
    const replayedKinds = res2.writtenChunks.map((c) => {
      const match = c.match(/"kind":"([^"]+)"/);
      return match?.[1];
    });
    expect(replayedKinds).toContain('ev2');
    expect(replayedKinds).toContain('ev3');
    expect(replayedKinds).not.toContain('ev1');
  });

  it('keeps ring buffer capped at 100 events', () => {
    const res = makeMockRes();
    svc.register('t:s:test', res as never);

    for (let i = 0; i < 120; i++) {
      svc.emit('t:s:test', { n: i });
    }

    expect(svc.buffer('t:s:test').length).toBe(100);
  });

  it('monotonically increments event ids', () => {
    const res = makeMockRes();
    svc.register('t:s:test', res as never);

    svc.emit('t:s:test', { a: 1 });
    svc.emit('t:s:test', { a: 2 });
    svc.emit('t:s:test', { a: 3 });

    const ids = res.writtenChunks.map((c) => {
      const m = c.match(/^id: (\d+)/);
      return m ? parseInt(m[1], 10) : -1;
    });
    expect(ids).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// DashboardProjectionHandler unit tests
// ---------------------------------------------------------------------------

describe('DashboardProjectionHandler', () => {
  let broadcaster: SseBroadcasterService;
  let handler: DashboardProjectionHandler;

  beforeEach(() => {
    broadcaster = new SseBroadcasterService();
    handler = new DashboardProjectionHandler(broadcaster);
  });

  it('broadcasts to both site-director and quarry-chief on stockpile event', () => {
    const sdRes = makeMockRes();
    const qcRes = makeMockRes();
    broadcaster.register('tenant1:site1:site-director', sdRes as never);
    broadcaster.register('tenant1:site1:quarry-chief', qcRes as never);

    handler.onStockpileEventAppended({
      tenantId: 'tenant1',
      siteId: 'site1',
      payload: { tenant_id: 'tenant1', site_id: 'site1' },
    });

    expect(sdRes.writtenChunks).toHaveLength(1);
    expect(qcRes.writtenChunks).toHaveLength(1);
    expect(sdRes.writtenChunks[0]).toContain('stockpile.event_appended');
  });

  it('emits 6 different @OnEvent handlers', () => {
    const emitSpy = jest.spyOn(broadcaster, 'emit');

    const evt = { tenantId: 't', siteId: 's' };

    handler.onHoleDrilled(evt);
    handler.onExtractionCycleAppended(evt);
    handler.onRotationCompleted(evt);
    handler.onStockpileEventAppended(evt);
    handler.onFuelRefuelAppended(evt);
    handler.onIncidentCreated(evt);

    // Each handler emits to 2 channels → 12 total emit calls
    expect(emitSpy).toHaveBeenCalledTimes(12);
  });

  it('skips emission when tenantId is missing', () => {
    const emitSpy = jest.spyOn(broadcaster, 'emit');
    handler.onHoleDrilled({ siteId: 's' });
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('skips emission when siteId is missing', () => {
    const emitSpy = jest.spyOn(broadcaster, 'emit');
    handler.onHoleDrilled({ tenantId: 't' });
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('each emitted payload contains kind kpi.delta', () => {
    const res = makeMockRes();
    broadcaster.register('t:s:site-director', res as never);

    handler.onStockpileEventAppended({ tenantId: 't', siteId: 's' });

    const chunk = res.writtenChunks[0];
    expect(chunk).toContain('"kind":"kpi.delta"');
  });
});
