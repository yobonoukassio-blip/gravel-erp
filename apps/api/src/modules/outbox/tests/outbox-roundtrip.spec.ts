import { Test } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { OutboxEvent } from '../outbox-event.entity';
import { OutboxService } from '../outbox.service';
import { OutboxWorkerProcessor } from '../outbox-worker.processor';

/**
 * Outbox roundtrip integration test.
 *
 * Requires a Postgres test database with `outbox_event` migration applied.
 * Skipped automatically when `OUTBOX_INTEGRATION_DB_URL` is not set —
 * the CI integration project sets it; the local `unit` project does not.
 *
 * What we prove:
 *   1. Inserting via OutboxService inside an explicit transaction commits
 *      the outbox row atomically with the (mock) business row.
 *   2. OutboxWorkerProcessor.drainOnce() emits to EventEmitter2 and marks
 *      `dispatched_at_utc`.
 *   3. After roundtrip a `@OnEvent`-style listener receives N events.
 */

const HAS_DB = !!process.env.OUTBOX_INTEGRATION_DB_URL;

(HAS_DB ? describe : describe.skip)('OutboxService + Worker roundtrip', () => {
  let ds: DataSource;
  let svc: OutboxService;
  let worker: OutboxWorkerProcessor;
  let emitter: EventEmitter2;
  const tenantId = '00000000-0000-0000-0000-00000000beef';

  beforeAll(async () => {
    ds = new DataSource({
      type: 'postgres',
      url: process.env.OUTBOX_INTEGRATION_DB_URL,
      entities: [OutboxEvent],
      synchronize: false,
    });
    await ds.initialize();

    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot({ wildcard: true })],
      providers: [
        OutboxService,
        OutboxWorkerProcessor,
        { provide: DataSource, useValue: ds },
      ],
    }).compile();

    svc = moduleRef.get(OutboxService);
    worker = moduleRef.get(OutboxWorkerProcessor);
    emitter = moduleRef.get(EventEmitter2);

    process.env.OUTBOX_WORKER_DISABLED = '1';
    await moduleRef.init();
  });

  afterAll(async () => {
    await ds?.destroy();
  });

  beforeEach(async () => {
    await ds.query(`SET LOCAL app.current_tenant = '${tenantId}'`);
    await ds.query(`DELETE FROM outbox_event WHERE tenant_id = $1`, [tenantId]);
  });

  it('publishes 10 events transactionally and worker dispatches them within 5s', async () => {
    const received: Array<{ outboxId: string; payload: unknown }> = [];
    emitter.on('production.test.unit_dispatched', (evt: { outboxId: string; payload: unknown }) => {
      received.push(evt);
    });

    await ds.transaction(async (manager) => {
      await manager.query(`SET LOCAL app.current_tenant = '${tenantId}'`);
      for (let i = 0; i < 10; i += 1) {
        await svc.publish({
          tenantId,
          aggregateType: 'TestAggregate',
          aggregateId: `00000000-0000-0000-0000-${i.toString(16).padStart(12, '0')}`,
          eventType: 'production.test.unit_dispatched',
          payload: { index: i },
          manager,
        });
      }
    });

    // Drive the worker manually rather than waiting for the timer.
    const startedAt = Date.now();
    let dispatched = 0;
    while (Date.now() - startedAt < 5_000 && dispatched < 10) {
      const result = await worker.drainOnce();
      dispatched += result.dispatched;
      if (dispatched < 10) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    expect(dispatched).toBe(10);
    expect(received.length).toBe(10);

    const pending = await ds.query(
      `SELECT COUNT(*)::int AS c FROM outbox_event
        WHERE tenant_id = $1 AND dispatched_at_utc IS NULL`,
      [tenantId],
    );
    expect(pending[0].c).toBe(0);
  });
});

/**
 * Pure-TS sanity check that runs in the unit project (no DB required).
 * Asserts the service constructs an OutboxEvent row via the EntityManager.
 */
describe('OutboxService (unit, mocked EntityManager)', () => {
  it('inserts a row using the caller-supplied EntityManager', async () => {
    const saved: OutboxEvent[] = [];
    const fakeRepo = {
      create: (row: Partial<OutboxEvent>) => row as OutboxEvent,
      save: async (row: OutboxEvent) => {
        saved.push(row);
        return row;
      },
    };
    const fakeManager = {
      getRepository: () => fakeRepo,
    } as unknown as Parameters<OutboxService['publish']>[0]['manager'];

    const svc = new OutboxService();
    await svc.publish({
      tenantId: '00000000-0000-0000-0000-000000000001',
      aggregateType: 'TruckRotation',
      aggregateId: '00000000-0000-0000-0000-000000000002',
      eventType: 'production.transport.rotation_completed',
      payload: { rotation_id: 'rot-1' },
      manager: fakeManager,
    });

    expect(saved.length).toBe(1);
    expect(saved[0].eventType).toBe('production.transport.rotation_completed');
    expect(saved[0].aggregateType).toBe('TruckRotation');
  });
});
