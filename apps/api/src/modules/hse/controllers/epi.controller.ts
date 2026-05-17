import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { EpiCondition } from '../entities/epi-assignment.entity';
import { EpiCategory } from '../entities/epi-item.entity';
import { EpiService } from '../services/epi.service';

interface AuthedRequest {
  user: { sub: string; tenantId: string; roles?: string[] };
}

/** HSE-03 EPI catalog + assignment REST surface. */
@Controller('hse/epi')
export class EpiController {
  constructor(private readonly epi: EpiService) {}

  @Get('items')
  async listItems(@Req() req: AuthedRequest): Promise<unknown[]> {
    return this.epi.listItems(req.user.tenantId);
  }

  @Post('items')
  async createItem(
    @Body() body: {
      name: string;
      category: EpiCategory;
      description?: string | null;
      isMandatory?: boolean;
    },
    @Req() req: AuthedRequest,
  ): Promise<unknown> {
    return this.epi.createItem({
      tenantId: req.user.tenantId,
      ...body,
    });
  }

  @Post('assignments/issue')
  async issue(
    @Body() body: {
      employeeId: string;
      epiItemId: string;
      notes?: string | null;
    },
    @Req() req: AuthedRequest,
  ): Promise<unknown> {
    return this.epi.issue({
      tenantId: req.user.tenantId,
      issuedBy: req.user.sub,
      ...body,
    });
  }

  @Post('assignments/:id/return')
  async return(
    @Param('id') id: string,
    @Body() body: { condition?: EpiCondition },
    @Req() req: AuthedRequest,
  ): Promise<unknown> {
    return this.epi.return({
      tenantId: req.user.tenantId,
      assignmentId: id,
      returnedBy: req.user.sub,
      condition: body.condition,
    });
  }

  @Get('employees/:employeeId/open')
  async listOpenForEmployee(
    @Param('employeeId') employeeId: string,
    @Req() req: AuthedRequest,
  ): Promise<unknown[]> {
    return this.epi.listOpenForEmployee(req.user.tenantId, employeeId);
  }

  @Get('compliance')
  async checkCompliance(
    @Query('employeeIds') employeeIdsCsv: string,
    @Req() req: AuthedRequest,
  ): Promise<unknown[]> {
    const ids = (employeeIdsCsv ?? '').split(',').filter(Boolean);
    return this.epi.checkCompliance(req.user.tenantId, ids);
  }
}
