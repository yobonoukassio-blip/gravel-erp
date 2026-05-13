import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { ShiftRosterService, UpsertShiftRosterInput } from '../services/shift-roster.service';

@Controller('rh/shift-rosters')
@UseGuards(JwtAuthGuard)
export class ShiftRosterController {
  constructor(private readonly shiftRosters: ShiftRosterService) {}

  /** Upsert shift roster for a given site and date. */
  @Put()
  upsert(@Body() body: UpsertShiftRosterInput) {
    return this.shiftRosters.upsert(body);
  }

  /** Get roster by ID. */
  @Get(':id')
  findById(@Param('id') id: string, @Query('tenant_id') tenantId: string) {
    return this.shiftRosters.findById(id, tenantId);
  }

  /** Get week's rosters for a site. */
  @Get()
  listForWeek(
    @Query('tenant_id') tenantId: string,
    @Query('site_id') siteId: string,
    @Query('week_start') weekStart: string,
  ) {
    return this.shiftRosters.listForWeek(tenantId, siteId, weekStart);
  }
}
