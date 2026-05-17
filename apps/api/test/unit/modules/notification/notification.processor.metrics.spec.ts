/**
 * NotificationProcessor metric instrumentation tests (HRD-MVP-06 Task 4).
 *
 * Verifies SLO-C and SLO-D emission:
 *   - bullmq_job_duration_seconds: observed in finally for EVERY attempt
 *   - alert_dispatch_latency_seconds: observed ONLY on successful dispatch
 */
import { Test } from '@nestjs/testing';
import { getToken } from '@willsoto/nestjs-prometheus';
import { ClsService } from 'nestjs-cls';
import { NotificationProcessor } from '../../../../src/modules/notification/notification.processor';
import { EmailBrevoProvider } from '../../../../src/modules/notification/providers/email-brevo.provider';
import { SmsTwilioProvider } from '../../../../src/modules/notification/providers/sms-twilio.provider';
import { InAppProvider } from '../../../../src/modules/notification/providers/in-app.provider';
import {
  NOTIFICATION_QUEUE_NAME,
  NotificationJobPayload,
} from '../../../../src/modules/notification/notification.types';

type Outcome =
  | { status: 'delivered'; providerMessageId?: string }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; error: string; retryable: boolean };

describe('NotificationProcessor — bullmq_job_duration_seconds + alert_dispatch_latency_seconds (SLO-C, SLO-D)', () => {
  const TENANT = '11111111-1111-1111-1111-111111111111';
  const USER = '22222222-2222-2222-2222-222222222222';
  const ALERT_ID = '33333333-3333-3333-3333-333333333333';

  let processor: NotificationProcessor;
  let bullmqObserve: jest.Mock;
  let dispatchObserve: jest.Mock;
  let emailSend: jest.Mock<Promise<Outcome>, unknown[]>;

  const makeJob = (overrides: Partial<NotificationJobPayload> = {}) => {
    const payload: NotificationJobPayload = {
      tenantId: TENANT,
      channel: 'email',
      recipient: {
        userId: USER,
        email: 'a@example.com',
        phone: null,
        displayName: 'Test',
        locale: 'fr-CI',
      },
      templateKey: 'alert.test',
      payload: {},
      metadata: { alertId: ALERT_ID, severity: 'critical' },
      ...overrides,
    };
    return {
      id: 'job-1',
      name: 'dispatch',
      data: payload,
      timestamp: Date.now() - 500, // enqueued 500ms ago
    } as unknown as import('bullmq').Job<NotificationJobPayload>;
  };

  beforeEach(async () => {
    bullmqObserve = jest.fn();
    dispatchObserve = jest.fn();
    emailSend = jest.fn();

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationProcessor,
        {
          provide: ClsService,
          useValue: {
            run: <T>(fn: () => Promise<T> | T) => Promise.resolve(fn()),
            set: jest.fn(),
          },
        },
        { provide: EmailBrevoProvider, useValue: { send: emailSend } },
        { provide: SmsTwilioProvider, useValue: { send: jest.fn() } },
        { provide: InAppProvider, useValue: { send: jest.fn() } },
        {
          provide: getToken('bullmq_job_duration_seconds'),
          useValue: { observe: bullmqObserve },
        },
        {
          provide: getToken('alert_dispatch_latency_seconds'),
          useValue: { observe: dispatchObserve },
        },
      ],
    }).compile();

    processor = moduleRef.get(NotificationProcessor);
  });

  it('Test 3: success path observes bullmq_job_duration_seconds', async () => {
    emailSend.mockResolvedValue({ status: 'delivered', providerMessageId: 'p1' });
    await processor.process(makeJob());
    expect(bullmqObserve).toHaveBeenCalledTimes(1);
    const [labels, duration] = bullmqObserve.mock.calls[0];
    expect(labels).toEqual({ queue: NOTIFICATION_QUEUE_NAME, job_name: 'dispatch' });
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it('Test 4: success path observes alert_dispatch_latency_seconds with severity+channel labels', async () => {
    emailSend.mockResolvedValue({ status: 'delivered' });
    await processor.process(makeJob());
    expect(dispatchObserve).toHaveBeenCalledTimes(1);
    const [labels, latency] = dispatchObserve.mock.calls[0];
    expect(labels).toEqual({ severity: 'critical', channel: 'email' });
    // The mocked job is enqueued 500ms ago, so latency >= 0.5s (allow scheduling jitter).
    expect(latency).toBeGreaterThanOrEqual(0.3);
  });

  it('Test 5a: failure path still observes bullmq_job_duration_seconds (finally block)', async () => {
    emailSend.mockResolvedValue({
      status: 'failed',
      error: 'permanent',
      retryable: false,
    });
    await expect(processor.process(makeJob())).rejects.toThrow();
    expect(bullmqObserve).toHaveBeenCalledTimes(1);
  });

  it('Test 5b: failure path does NOT observe alert_dispatch_latency_seconds', async () => {
    emailSend.mockResolvedValue({
      status: 'failed',
      error: 'permanent',
      retryable: false,
    });
    await expect(processor.process(makeJob())).rejects.toThrow();
    expect(dispatchObserve).not.toHaveBeenCalled();
  });

  it('Test 5c: skipped outcome (provider_not_configured) does NOT observe dispatch latency', async () => {
    emailSend.mockResolvedValue({
      status: 'skipped',
      reason: 'provider_not_configured',
    });
    await processor.process(makeJob());
    expect(dispatchObserve).not.toHaveBeenCalled();
    // But bullmq duration still recorded — we worked the job.
    expect(bullmqObserve).toHaveBeenCalledTimes(1);
  });

  it('Test 5d: missing metadata.severity falls back to "unknown" label', async () => {
    emailSend.mockResolvedValue({ status: 'delivered' });
    await processor.process(makeJob({ metadata: undefined }));
    const [labels] = dispatchObserve.mock.calls[0];
    expect(labels.severity).toBe('unknown');
    expect(labels.channel).toBe('email');
  });
});
