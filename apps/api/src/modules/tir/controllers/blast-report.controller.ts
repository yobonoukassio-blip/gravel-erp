import { Body, Controller, Post, Param } from '@nestjs/common';
import { AppendBlastReportInput, BlastReportService } from '../services/blast-report.service';
import { ExplosivesReconciliationJob } from '../jobs/explosives-reconciliation.job';
import { ExplosivesReconciliationService } from '../services/explosives-reconciliation.service';

@Controller()
export class BlastReportController {
  constructor(
    private readonly blastReportService: BlastReportService,
    private readonly reconciliationJob: ExplosivesReconciliationJob,
    private readonly reconciliationService: ExplosivesReconciliationService,
  ) {}

  /** POST /blast-report — submit immutable blast report (plan must be FIRED) */
  @Post('blast-report')
  async append(@Body() body: AppendBlastReportInput) {
    return this.blastReportService.append(body);
  }

  /**
   * POST /explosives-reconciliation/:operationalDayId/physical-count
   * TIR_SUPERVISOR submits manual physical count override.
   * Calls resolveClosure after successful submission.
   */
  @Post('explosives-reconciliation/:operationalDayId/physical-count')
  async submitPhysicalCount(
    @Param('operationalDayId') operationalDayId: string,
    @Body()
    body: {
      tenantId: string;
      siteId: string;
      productType: string;
      quantityG: number;
      submittedBy: string;
      reason: string;
      overrideAuthorizedBy: string;
    },
  ) {
    await this.reconciliationService.recordPhysicalCount(
      {
        operationalDayId,
        productType: body.productType,
        quantityG: body.quantityG,
        submittedBy: body.submittedBy,
        reason: body.reason,
        overrideAuthorizedBy: body.overrideAuthorizedBy,
      },
      body.tenantId,
    );
    // After physical count submission, resolve the closure blocker
    await this.reconciliationJob.resolveGap(operationalDayId);
    return { success: true };
  }
}
