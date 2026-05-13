import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { CostPerTonAggregatorService } from '../services/cost-per-ton-aggregator.service';
import { BudgetComparisonService } from '../services/budget-comparison.service';
import { MarginService } from '../services/margin.service';
import { ConsolidationService } from '../services/consolidation.service';
import { OhadaExportService, OhadaTarget } from '../services/ohada-export.service';

interface AuthedRequest {
  user: { sub: string; tenantId: string; roles?: string[] };
}

/** Analytics + Finance REST endpoints (Phase 4). */
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly aggregator: CostPerTonAggregatorService,
    private readonly budgets: BudgetComparisonService,
    private readonly margins: MarginService,
    private readonly consolidation: ConsolidationService,
    private readonly ohada: OhadaExportService,
  ) {}

  @Post('cost-per-ton/aggregate')
  async aggregateCostPerTon(
    @Body() body: { siteId: string; snapshotDate: string; calibreCode: string },
    @Req() req: AuthedRequest,
  ) {
    return this.aggregator.aggregateForDate({
      tenantId: req.user.tenantId,
      siteId: body.siteId,
      snapshotDate: body.snapshotDate,
      calibreCode: body.calibreCode,
    });
  }

  @Get('budget/comparison')
  async budgetVsActual(
    @Query('siteId') siteId: string,
    @Query('year') year: string,
    @Query('asOfDate') asOfDate: string,
    @Req() req: AuthedRequest,
  ) {
    return this.budgets.compareForSite({
      tenantId: req.user.tenantId,
      siteId,
      year: Number(year),
      asOfDate,
    });
  }

  @Get('margin/contract/:contractId')
  async marginByContract(
    @Param('contractId') contractId: string,
    @Query('asOfDate') asOfDate: string,
    @Req() req: AuthedRequest,
  ) {
    return this.margins.marginByContract({
      tenantId: req.user.tenantId,
      contractId,
      asOfDate,
    });
  }

  @Get('margin/site/:siteId')
  async marginBySite(
    @Param('siteId') siteId: string,
    @Query('from') periodFrom: string,
    @Query('to') periodTo: string,
    @Req() req: AuthedRequest,
  ) {
    return this.margins.marginBySite({
      tenantId: req.user.tenantId,
      siteId,
      periodFrom,
      periodTo,
    });
  }

  @Get('consolidation')
  async consolidate(
    @Query('pivot') pivot: 'XOF' | 'EUR',
    @Query('from') periodFrom: string,
    @Query('to') periodTo: string,
    @Req() req: AuthedRequest,
  ) {
    return this.consolidation.consolidate({
      tenantId: req.user.tenantId,
      pivotCurrency: pivot === 'EUR' ? 'EUR' : 'XOF',
      periodFrom,
      periodTo,
    });
  }

  @Get('ohada-export')
  async ohadaExport(
    @Query('siteId') siteId: string,
    @Query('from') periodFrom: string,
    @Query('to') periodTo: string,
    @Query('target') target: OhadaTarget,
    @Req() req: AuthedRequest,
  ): Promise<{ csv: string; target: OhadaTarget }> {
    const csv = await this.ohada.exportForPeriod({
      tenantId: req.user.tenantId,
      siteId,
      periodFrom,
      periodTo,
      target,
    });
    return { csv, target };
  }
}
