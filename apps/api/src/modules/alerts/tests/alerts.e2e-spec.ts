import { Alert } from '../alert.entity';
import { AlertsEventHandlers } from '../alerts.event-handlers';
import { AlertsService } from '../alerts.service';

/**
 * Alerts module tests.
 *
 * Pure-TS path (always runs): we mock the TypeORM Repository to validate
 * dedupe logic and event handler wiring without needing a Postgres
 * instance. The DB-backed e2e spec lives in
 * `test/e2e/alerts.full.e2e-spec.ts` and runs in the `integration`
 * Jest project.
 */

class InMemoryRepo {
  rows: Alert[] = [];
  create(row: Partial<Alert>): Alert {
    return { id: `id-${this.rows.length + 1}`, ...row } as Alert;
  }
  async save(row: Alert): Promise<Alert> {
    const idx = this.rows.findIndex((r) => r.id === row.id);
    if (idx >= 0) this.rows[idx] = row;
    else this.rows.push(row);
    return row;
  }
  async findOne(opts: { where: Partial<Alert> }): Promise<Alert | null> {
    return (
      this.rows.find((r) =>
        Object.entries(opts.where).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v),
      ) ?? null
    );
  }
  async find(opts: { where: Partial<Alert> }): Promise<Alert[]> {
    return this.rows.filter((r) =>
      Object.entries(opts.where).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v),
    );
  }
}

describe('AlertsService — dedupe + lifecycle', () => {
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const siteId = '00000000-0000-0000-0000-0000000000aa';
  let repo: InMemoryRepo;
  let svc: AlertsService;

  beforeEach(() => {
    repo = new InMemoryRepo();
    svc = new AlertsService(repo as never);
  });

  it('creates a new alert on first event', async () => {
    const a = await svc.createFromEvent({
      tenantId,
      siteId,
      sourceEventType: 'production.stockpile.threshold_crossed',
      dedupeKey: 'stockpile:s1:granite:low',
      severity: 'high',
      payload: { whatever: 1 },
    });
    expect(a.status).toBe('open');
    expect(repo.rows.length).toBe(1);
  });

  it('dedupes: second threshold event with same key reuses OPEN row', async () => {
    await svc.createFromEvent({
      tenantId, siteId,
      sourceEventType: 'production.stockpile.threshold_crossed',
      dedupeKey: 'stockpile:s1:granite:low',
      severity: 'high',
      payload: { ts: 1 },
    });
    await svc.createFromEvent({
      tenantId, siteId,
      sourceEventType: 'production.stockpile.threshold_crossed',
      dedupeKey: 'stockpile:s1:granite:low',
      severity: 'high',
      payload: { ts: 2 },
    });
    expect(repo.rows.length).toBe(1);
  });

  it('ack transitions open → acked', async () => {
    const a = await svc.createFromEvent({
      tenantId, siteId,
      sourceEventType: 'hse.incident.created',
      severity: 'critical',
      payload: {},
    });
    const acked = await svc.ack(a.id, 'user-1', tenantId);
    expect(acked.status).toBe('acked');
    expect(acked.ackedBy).toBe('user-1');
  });

  it('resolve transitions any non-resolved → resolved', async () => {
    const a = await svc.createFromEvent({
      tenantId, siteId,
      sourceEventType: 'production.fuel.anomaly_detected',
      severity: 'high',
      payload: {},
    });
    const resolved = await svc.resolve(a.id, 'user-2', tenantId);
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolvedBy).toBe('user-2');
  });

  it('resolve on already-resolved alert throws', async () => {
    const a = await svc.createFromEvent({
      tenantId, siteId,
      sourceEventType: 'hse.incident.created',
      severity: 'low',
      payload: {},
    });
    await svc.resolve(a.id, 'u', tenantId);
    await expect(svc.resolve(a.id, 'u', tenantId)).rejects.toThrow();
  });
});

describe('AlertsEventHandlers — 3 channels', () => {
  const tenantId = '00000000-0000-0000-0000-000000000001';
  let repo: InMemoryRepo;
  let svc: AlertsService;
  let handlers: AlertsEventHandlers;

  beforeEach(() => {
    repo = new InMemoryRepo();
    svc = new AlertsService(repo as never);
    handlers = new AlertsEventHandlers(svc);
  });

  it('production.stockpile.threshold_crossed → critical alert when critical_low', async () => {
    await handlers.onStockpileThreshold({
      tenantId,
      payload: {
        site_id: 's1',
        stockpile_id: 'stk-1',
        calibre_code: '0_5',
        threshold_type: 'critical_low',
      },
    });
    expect(repo.rows[0].severity).toBe('critical');
    expect(repo.rows[0].sourceEventType).toBe('production.stockpile.threshold_crossed');
  });

  it('production.fuel.anomaly_detected → dedupe by equipment + direction', async () => {
    const evt = {
      tenantId,
      payload: {
        site_id: 's1',
        equipment_id: 'eq-1',
        direction: 'high' as const,
        ratio_observed: 2.1,
        ratio_median_30d: 1.0,
      },
    };
    await handlers.onFuelAnomaly(evt);
    await handlers.onFuelAnomaly(evt);
    expect(repo.rows.length).toBe(1);
  });

  it('hse.incident.created severity 4 → critical alert, no dedupe', async () => {
    await handlers.onHseIncident({
      tenantId,
      payload: { site_id: 's1', incident_id: 'inc-1', severity_numeric: 4 },
    });
    await handlers.onHseIncident({
      tenantId,
      payload: { site_id: 's1', incident_id: 'inc-2', severity_numeric: 4 },
    });
    expect(repo.rows.length).toBe(2);
    expect(repo.rows.every((r) => r.severity === 'critical')).toBe(true);
  });
});
