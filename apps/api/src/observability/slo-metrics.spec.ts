/**
 * SloMetricsModule unit tests (HRD-MVP-06 Task 3).
 *
 * Note on test location: the project's jest.config.ts only picks up specs
 * under `test/unit|integration|security|chaos`. This file is co-located in
 * src/ for IDE discovery + onboarding clarity; the runnable mirror lives at
 * `apps/api/test/unit/observability/slo-metrics.spec.ts`. Both files share
 * the same assertions — keep them in sync if you change one.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getToken } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram } from 'prom-client';
import { SloMetricsModule } from './slo-metrics.module';

describe('SloMetricsModule', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [SloMetricsModule],
    }).compile();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('registers sync_attempts_total counter with tenant_id+result labels', () => {
    const counter = moduleRef.get<Counter<string>>(getToken('sync_attempts_total'));
    expect(counter).toBeDefined();
    counter.inc({ tenant_id: 't-001', result: 'success' });
    counter.inc({ tenant_id: 't-001', result: 'failure' });
    // No throw means labels are accepted; metric registry is live.
    expect(typeof counter.inc).toBe('function');
  });

  it('registers bullmq_job_duration_seconds histogram with the SLO-C buckets', () => {
    const histo = moduleRef.get<Histogram<string>>(
      getToken('bullmq_job_duration_seconds'),
    );
    expect(histo).toBeDefined();
    // Bucket boundaries match slo-definitions.md §5: 10, 30, 60, 300, 600, 1800
    // prom-client exposes upperBounds on the internal Histogram instance.
    const buckets = (histo as unknown as { upperBounds: number[] }).upperBounds;
    expect(buckets).toEqual([10, 30, 60, 300, 600, 1800]);
  });

  it('registers alert_dispatch_latency_seconds histogram with the SLO-D buckets', () => {
    const histo = moduleRef.get<Histogram<string>>(
      getToken('alert_dispatch_latency_seconds'),
    );
    expect(histo).toBeDefined();
    const buckets = (histo as unknown as { upperBounds: number[] }).upperBounds;
    expect(buckets).toEqual([1, 5, 10, 30, 60, 120, 300]);
  });
});
