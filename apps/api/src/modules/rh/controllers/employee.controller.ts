import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { EmployeeService, CreateEmployeeInput, UpdateEmployeeInput } from '../services/employee.service';
import { RhHabilitationService } from '../services/rh-habilitation.service';

@Controller('rh/employees')
@UseGuards(JwtAuthGuard)
export class EmployeeController {
  constructor(
    private readonly employees: EmployeeService,
    private readonly habilitation: RhHabilitationService,
  ) {}

  @Post()
  create(@Body() body: CreateEmployeeInput) {
    return this.employees.create(body);
  }

  @Get()
  list(
    @Query('tenant_id') tenantId: string,
    @Query('site_id') siteId?: string,
    @Query('is_active') isActive?: string,
    @Query('cert_code') certCode?: string,
    @Query('cert_valid_as_of') certValidAsOf?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.employees.list(tenantId, {
      siteId,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      certCode,
      certValidAsOf,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id')
  findById(@Param('id') id: string, @Query('tenant_id') tenantId: string) {
    return this.employees.findById(id, tenantId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Query('tenant_id') tenantId: string,
    @Body() body: UpdateEmployeeInput,
  ) {
    return this.employees.update(id, tenantId, body);
  }

  /** Check habilitation as-of a given date. */
  @Get(':id/habilitation/:certCode')
  async checkHabilitation(
    @Param('id') employeeId: string,
    @Param('certCode') certCode: string,
    @Query('as_of') asOf: string,
  ) {
    const asOfDate = new Date(asOf);
    const valid = await this.habilitation.isValidAt(employeeId, certCode, asOfDate);
    return { employee_id: employeeId, cert_code: certCode, as_of: asOf, valid };
  }
}
