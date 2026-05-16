import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { Roles } from '../../identity/decorators/roles.decorator';
import { BlastClearanceService } from '../services/blast-clearance.service';
import { BlastPlanService, CreateBlastPlanInput } from '../services/blast-plan.service';

// P0-8 (audit 2026-05-16): explosives endpoints had ZERO role guards. Any
// authenticated user could create plans, approve HSE clearance, request fire,
// or issue zone clearance. RBAC is now enforced per endpoint with the most
// restrictive role set compatible with operational reality.
@Controller('blast-plans')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BlastPlanController {
  constructor(
    private readonly blastPlanService: BlastPlanService,
    private readonly blastClearanceService: BlastClearanceService,
  ) {}

  @Post()
  @Roles('CHEF_CARRIERE', 'QUARRY_CHIEF', 'SITE_MANAGER', 'DIRECTEUR_SITE')
  async create(@Body() body: CreateBlastPlanInput) {
    return this.blastPlanService.create(body);
  }

  @Get(':id')
  @Roles(
    'CHEF_CARRIERE',
    'QUARRY_CHIEF',
    'SITE_MANAGER',
    'DIRECTEUR_SITE',
    'DIRECTION_GROUPE',
    'HSE',
    'HSE_OFFICER',
  )
  async findById(
    @Param('id') id: string,
    @Query('tenantId') tenantId: string,
  ) {
    return this.blastPlanService.findById(id, tenantId);
  }

  @Post(':id/approve-hse')
  @Roles('HSE', 'HSE_OFFICER')
  async approveHse(
    @Param('id') id: string,
    @Body() body: { hseOfficerId: string; tenantId: string },
  ) {
    return this.blastPlanService.approveHse(id, body.hseOfficerId, body.tenantId);
  }

  @Post(':id/approve-loading')
  @Roles('CHEF_CARRIERE', 'QUARRY_CHIEF', 'SITE_MANAGER')
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
  @Roles('CHEF_CARRIERE', 'QUARRY_CHIEF', 'SITE_MANAGER')
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
  @Roles('HSE', 'HSE_OFFICER')
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
