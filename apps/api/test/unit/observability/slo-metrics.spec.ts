/**
 * SloMetricsModule unit tests — runnable mirror of src/observability/slo-metrics.spec.ts
 * (jest only picks up specs under test/unit per jest.config.ts).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getToken } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram } from 'prom-client';
import { SloMetricsModule } from '../../../src/observability/slo-metrics.module';

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
    expect(typeof counter.inc).toBe('function');
  });

  it('registers bullmq_job_duration_seconds histogram with the SLO-C buckets', () => {
    const histo = moduleRef.get<Histogram<string>>(
      getToken('bullmq_job_duration_seconds'),
    );
    expect(histo).toBeDefined();
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
