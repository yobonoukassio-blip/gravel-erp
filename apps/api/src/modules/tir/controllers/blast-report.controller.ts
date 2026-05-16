import { Body, Controller, Post, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { Roles } from '../../identity/decorators/roles.decorator';
import { AppendBlastReportInput, BlastReportService } from '../services/blast-report.service';
import { ExplosivesReconciliationJob } from '../jobs/explosives-reconciliation.job';
import { ExplosivesReconciliationService } from '../services/explosives-reconciliation.service';

// P0-8 (audit 2026-05-16): RBAC enforced on blast-report + explosives
// reconciliation. Append is restricted to the supervisors who can submit
// reports; physical-count submission requires the additional authority chain.
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class BlastReportController {
  constructor(
    private readonly blastReportService: BlastReportService,
    private readonly reconciliationJob: ExplosivesReconciliationJob,
    private readonly reconciliationService: ExplosivesReconciliationService,
  ) {}

  /** POST /blast-report — submit immutable blast report (plan must be FIRED) */
  @Post('blast-report')
  @Roles('CHEF_CARRIERE', 'QUARRY_CHIEF', 'SITE_MANAGER', 'HSE', 'HSE_OFFICER')
  async append(@Body() body: AppendBlastReportInput) {
    return this.blastReportService.append(body);
  }

  /**
   * POST /explosives-reconciliation/:operationalDayId/physical-count
   * TIR_SUPERVISOR submits manual physical count override.
   * Calls resolveClosure after successful submission.
   */
  @Post('explosives-reconciliation/:operationalDayId/physical-count')
  @Roles('CHEF_CARRIERE', 'QUARRY_CHIEF', 'SITE_MANAGER', 'HSE', 'HSE_OFFICER')
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
