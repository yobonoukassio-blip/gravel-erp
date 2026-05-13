import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { Roles } from '../../identity/decorators/roles.decorator';
import { CrusherSessionService, CompleteCrusherSessionDto, OpenCrusherSessionDto } from '../services/crusher-session.service';
import { CrusherSessionStatus } from '../entities/crusher-session.entity';

@Controller('crusher-sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CrusherSessionController {
  constructor(private readonly service: CrusherSessionService) {}

  @Post()
  @Roles('PROCESSING_OPERATOR', 'QUARRY_CHIEF')
  open(@Body() dto: OpenCrusherSessionDto) {
    return this.service.open(dto);
  }

  @Get()
  @Roles('PROCESSING_OPERATOR', 'QUARRY_CHIEF', 'DIRECTION_GROUPE', 'DIRECTEUR_SITE')
  list(
    @Query('tenantId') tenantId: string,
    @Query('siteId') siteId?: string,
    @Query('operationalDayId') operationalDayId?: string,
    @Query('status') status?: CrusherSessionStatus,
  ) {
    return this.service.list(tenantId, { siteId, operationalDayId, status });
  }

  @Get(':id')
  @Roles('PROCESSING_OPERATOR', 'QUARRY_CHIEF', 'DIRECTION_GROUPE', 'DIRECTEUR_SITE')
  findById(@Param('id') id: string, @Query('tenantId') tenantId: string) {
    return this.service.findById(id, tenantId);
  }

  @Put(':id/pause')
  @Roles('PROCESSING_OPERATOR', 'QUARRY_CHIEF')
  pause(@Param('id') id: string) {
    return this.service.pause(id);
  }

  @Put(':id/resume')
  @Roles('PROCESSING_OPERATOR', 'QUARRY_CHIEF')
  resume(@Param('id') id: string) {
    return this.service.resume(id);
  }

  @Put(':id/complete')
  @Roles('PROCESSING_OPERATOR', 'QUARRY_CHIEF')
  complete(@Param('id') id: string, @Body() dto: CompleteCrusherSessionDto) {
    return this.service.complete(id, dto);
  }
}
