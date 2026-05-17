import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditExportService } from './audit-export.service';
import { NotificationService } from '../notification/notification.service';
import { Tenant } from '../tenancy/entities/tenant.entity';

export interface CronRunResult {
  readonly sent: number;
  readonly failed: number;
  readonly skipped: number;
}

/**
 * AuditExportCron (HRD-MVP-05 — D-16).
 *
 * Quarterly at 04:00 UTC on the 1st of Jan/Apr/Jul/Oct: iterates every
 * active tenant that has a compliance_email set and dispatches the
 * previous-quarter audit export to that address via the Phase 9
 * NotificationService.
 *
 * Per-tenant fault isolation: one tenant failing does not abort the run
 * (mirrors PreventiveMaintenanceSchedulerJob and CostPerTonAggregatorJob).
 *
 * Email is dispatched via NotificationService.dispatch() — the producer-side
 * facade for the BullMQ 'notifications' queue. Channel='email',
 * templateKey='audit.export.quarterly'. The provider worker (EmailBrevoProvider)
 * renders the body from the template using `payload.complianceCsvUrl`,
 * `payload.quarterLabel`, `payload.tenantName`.
 */
@Injectable()
export class AuditExportCron {
  private readonly logger = new Logger(AuditExportCron.name);

  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly exportSvc: AuditExportService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Quarterly: 1st of Jan/Apr/Jul/Oct at 04:00 UTC (D-16).
   * Cron syntax: minute hour day-of-month month day-of-week.
   */
  @Cron('0 4 1 1,4,7,10 *', { name: 'audit-quarterly-export', timeZone: 'UTC' })
  async handleCron(): Promise<void> {
    await this.runForNow(new Date());
  }

  /** Public entry-point for tests and ops scripts. */
  async runForNow(asOf: Date): Promise<CronRunResult> {
    const { from, to } = this.previousQuarterWindow(asOf);
    const quarterLabel = this.quarterLabel(from);

    const tenants = await this.tenants
      .createQueryBuilder('t')
      .where("t.status = 'active'")
      .andWhere('t.compliance_email IS NOT NULL')
      .getMany();

    this.logger.log(
      `[audit-export-cron] start asOf=${asOf.toISOString()} window=[${from.toISOString()},${to.toISOString()}) tenants=${tenants.length}`,
    );

    let sent = 0;
    let failed = 0;

    for (const tenant of tenants) {
      const email = tenant.complianceEmail;
      if (!email) continue;
      try {
        const result = await this.exportSvc.export({ tenantId: tenant.id, from, to });
        await this.notifications.dispatch({
          tenantId: tenant.id,
          channel: 'email',
          recipient: {
            userId: 'system',
            email,
            phone: null,
            displayName: `${tenant.name} Compliance`,
            locale: tenant.defaultLocale,
          },
          templateKey: 'audit.export.quarterly',
          payload: {
            tenantName: tenant.name,
            quarterLabel,
            complianceCsvUrl: result.complianceCsvUrl,
            generatedAt: result.generatedAt,
            chainBreakCount: result.chainVerification.filter((c) => !c.valid).length,
            rowCount: result.auditRows.length,
          },
          metadata: {
            eventType: 'audit.export.quarterly',
            severity: 'info',
          },
        });
        sent++;
        this.logger.log(
          `[audit-export-cron] sent tenant=${tenant.id} quarter=${quarterLabel} rows=${result.auditRows.length}`,
        );
      } catch (err) {
        failed++;
        this.logger.error(
          `[audit-export-cron] FAILED tenant=${tenant.id} quarter=${quarterLabel}: ${(err as Error).message}`,
        );
        // Continue with the next tenant.
      }
    }

    this.logger.log(
      `[audit-export-cron] done quarter=${quarterLabel} sent=${sent} failed=${failed} totalTenants=${tenants.length}`,
    );
    return { sent, failed, skipped: tenants.length - sent - failed };
  }

  /**
   * Returns [start of previous quarter, start of current quarter) in UTC.
   * Examples (asOf):
   *   - 2026-04-01 04:00 -> [2026-01-01, 2026-04-01)
   *   - 2026-01-01 04:00 -> [2025-10-01, 2026-01-01)
   *   - 2026-07-01 04:00 -> [2026-04-01, 2026-07-01)
   */
  previousQuarterWindow(now: Date): { from: Date; to: Date } {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth(); // 0-11
    const currentQuarterStartMonth = Math.floor(month / 3) * 3;
    const to = new Date(Date.UTC(year, currentQuarterStartMonth, 1));
    const fromMonth = currentQuarterStartMonth === 0 ? 9 : currentQuarterStartMonth - 3;
    const fromYear = currentQuarterStartMonth === 0 ? year - 1 : year;
    const from = new Date(Date.UTC(fromYear, fromMonth, 1));
    return { from, to };
  }

  private quarterLabel(d: Date): string {
    const q = Math.floor(d.getUTCMonth() / 3) + 1;
    return `Q${q} ${d.getUTCFullYear()}`;
  }
}
