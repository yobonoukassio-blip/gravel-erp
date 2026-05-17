import { Test, TestingModule } from '@nestjs/testing';
import { AlertsService } from '../../../src/modules/alerts/alerts.service';
import { PmOpenedAlertHandler } from '../../../src/modules/maintenance/event-handlers/pm-opened-alert.handler';

/**
 * PmOpenedAlertHandler unit tests (Phase 8 W2-P01 T03).
 *
 * Verifies:
 *  - severity boundary mapping: 'warning' -> 'high', 'critical' -> 'critical'
 *  - dedupe key shape: `pm:<pm_plan_id>:overdue`
 *  - fallback dedupe key when pm_plan_id is null: `pm:wo:<work_order_id>`
 *  - dedupe via AlertsService.createFromEvent (handled by AlertsService;
 *    handler only ensures dedupeKey is passed through)
 */
describe('PmOpenedAlertHandler', () => {
  let handler: PmOpenedAlertHandler;
  let mockCreateFromEvent: jest.Mock;

  beforeEach(async () => {
    mockCreateFromEvent = jest.fn().mockResolvedValue({ id: 'alert-1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PmOpenedAlertHandler,
        {
          provide: AlertsService,
          useValue: { createFromEvent: mockCreateFromEvent },
        },
      ],
    }).compile();

    handler = module.get(PmOpenedAlertHandler);
  });

  it('Test 1: warning payload severity maps to Alert.severity high, dedupeKey pm:<plan>:overdue', async () => {
    await handler.onPreventiveOpened({
      tenant_id: 't-1',
      site_id: 's-1',
      equipment_id: 'eq-1',
      pm_plan_id: 'pmp-1',
      work_order_id: 'wo-1',
      severity: 'warning',
      due_reason: 'hours',
      overdue_by: 25,
    });

    expect(mockCreateFromEvent).toHaveBeenCalledTimes(1);
    const arg = mockCreateFromEvent.mock.calls[0][0];
    expect(arg.tenantId).toBe('t-1');
    expect(arg.siteId).toBe('s-1');
    expect(arg.sourceEventType).toBe('maintenance.work_order.preventive_opened');
    expect(arg.sourceEventId).toBe('wo-1');
    expect(arg.dedupeKey).toBe('pm:pmp-1:overdue');
    expect(arg.severity).toBe('high');
    expect(arg.payload).toMatchObject({
      equipment_id: 'eq-1',
      pm_plan_id: 'pmp-1',
      work_order_id: 'wo-1',
      due_reason: 'hours',
      overdue_by: 25,
      source_severity: 'warning',
    });
  });

  it('Test 2: critical payload severity maps to Alert.severity critical', async () => {
    await handler.onPreventiveOpened({
      tenant_id: 't-1',
      site_id: 's-1',
      equipment_id: 'eq-1',
      pm_plan_id: 'pmp-2',
      work_order_id: 'wo-2',
      severity: 'critical',
      due_reason: 'days',
      overdue_by: 200,
    });

    const arg = mockCreateFromEvent.mock.calls[0][0];
    expect(arg.severity).toBe('critical');
    expect(arg.dedupeKey).toBe('pm:pmp-2:overdue');
    expect(arg.payload.source_severity).toBe('critical');
  });

  it('Test 3: dedupe via AlertsService.createFromEvent — emitting twice still results in one downstream call per emit (AlertsService handles dedupe)', async () => {
    const payload = {
      tenant_id: 't-1',
      site_id: 's-1',
      equipment_id: 'eq-1',
      pm_plan_id: 'pmp-3',
      work_order_id: 'wo-3',
      severity: 'warning' as const,
      due_reason: 'hours' as const,
      overdue_by: 10,
    };

    await handler.onPreventiveOpened(payload);
    await handler.onPreventiveOpened(payload);

    // Handler always forwards; dedupe is enforced inside AlertsService.createFromEvent
    // via the dedupeKey + status='open' lookup (covered by AlertsService tests).
    // Both calls use the same dedupeKey — proves the handler passes it through.
    expect(mockCreateFromEvent).toHaveBeenCalledTimes(2);
    expect(mockCreateFromEvent.mock.calls[0][0].dedupeKey).toBe('pm:pmp-3:overdue');
    expect(mockCreateFromEvent.mock.calls[1][0].dedupeKey).toBe('pm:pmp-3:overdue');
  });

  it('Test 4: when pm_plan_id is null (manual preventive WO), falls back to pm:wo:<work_order_id>', async () => {
    await handler.onPreventiveOpened({
      tenant_id: 't-1',
      site_id: 's-1',
      equipment_id: 'eq-1',
      pm_plan_id: null as unknown as string,
      work_order_id: 'wo-manual',
      severity: 'warning',
      due_reason: null,
      overdue_by: null,
    });

    const arg = mockCreateFromEvent.mock.calls[0][0];
    expect(arg.dedupeKey).toBe('pm:wo:wo-manual');
  });
});
