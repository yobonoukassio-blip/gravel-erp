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
import {
  SubcontractorService,
  CreateSubcontractorInput,
} from '../services/subcontractor.service';

@Controller('rh/subcontractors')
@UseGuards(JwtAuthGuard)
export class SubcontractorController {
  constructor(private readonly subcontractors: SubcontractorService) {}

  @Post()
  create(@Body() body: CreateSubcontractorInput) {
    return this.subcontractors.create(body);
  }

  @Get()
  list(
    @Query('tenant_id') tenantId: string,
    @Query('is_active') isActive?: string,
  ) {
    return this.subcontractors.list(
      tenantId,
      isActive !== undefined ? isActive === 'true' : undefined,
    );
  }

  @Get(':id')
  findById(@Param('id') id: string, @Query('tenant_id') tenantId: string) {
    return this.subcontractors.findById(id, tenantId);
  }

  /** Soft-delete — set is_active = false. */
  @Patch(':id/archive')
  archive(@Param('id') id: string, @Query('tenant_id') tenantId: string) {
    return this.subcontractors.archive(id, tenantId);
  }
}
