import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { BlastClearanceService } from '../services/blast-clearance.service';
import { BlastPlanService, CreateBlastPlanInput } from '../services/blast-plan.service';

@Controller('blast-plans')
export class BlastPlanController {
  constructor(
    private readonly blastPlanService: BlastPlanService,
    private readonly blastClearanceService: BlastClearanceService,
  ) {}

  @Post()
  async create(@Body() body: CreateBlastPlanInput) {
    return this.blastPlanService.create(body);
  }

  @Get(':id')
  async findById(
    @Param('id') id: string,
    @Query('tenantId') tenantId: string,
  ) {
    return this.blastPlanService.findById(id, tenantId);
  }

  @Post(':id/approve-hse')
  async approveHse(
    @Param('id') id: string,
    @Body() body: { hseOfficerId: string; tenantId: string },
  ) {
    return this.blastPlanService.approveHse(id, body.hseOfficerId, body.tenantId);
  }

  @Post(':id/approve-loading')
  async approveLoading(
    @Param('id') id: string,
    @Body() body: {
      operatorId: string;
      tenantId: string;
      operationalDay: { id: string; shiftStartLocal: string };
    },
  ) {
    return this.blastPlanService.approveLoading(
      id,
      body.operatorId,
      {
        id: body.operationalDay.id,
        shiftStartLocal: new Date(body.operationalDay.shiftStartLocal),
      },
      body.tenantId,
    );
  }

  @Post(':id/request-fire')
  async requestFire(
    @Param('id') id: string,
    @Body() body: {
      supervisorId: string;
      tenantId: string;
      operationalDay: { id: string; shiftStartLocal: string };
    },
  ) {
    return this.blastPlanService.requestFire(
      id,
      body.supervisorId,
      {
        id: body.operationalDay.id,
        shiftStartLocal: new Date(body.operationalDay.shiftStartLocal),
      },
      body.tenantId,
    );
  }

  @Post(':id/issue-clearance')
  async issueClearance(
    @Param('id') id: string,
    @Body() body: { hseOfficerId: string; tenantId: string },
  ) {
    return this.blastClearanceService.issueZoneClearance(
      id,
      body.hseOfficerId,
      body.tenantId,
    );
  }
}
