import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { ShiftEntryService, CreateShiftEntryInput } from '../services/shift-entry.service';

@Controller('rh/shift-entries')
@UseGuards(JwtAuthGuard)
export class ShiftEntryController {
  constructor(private readonly shiftEntries: ShiftEntryService) {}

  /** Create a new shift entry (check-in). */
  @Post()
  create(@Body() body: CreateShiftEntryInput) {
    return this.shiftEntries.create({
      ...body,
      checkInUtc: new Date(body.checkInUtc),
    });
  }

  /** Record check-out for an existing entry (creates a new superseding row). */
  @Post(':id/check-out')
  recordCheckOut(
    @Param('id') id: string,
    @Query('tenant_id') tenantId: string,
    @Body() body: { check_out_utc: string },
  ) {
    return this.shiftEntries.recordCheckOut(id, tenantId, new Date(body.check_out_utc));
  }

  @Get()
  listForOperationalDay(
    @Query('tenant_id') tenantId: string,
    @Query('operational_day_id') operationalDayId: string,
  ) {
    return this.shiftEntries.listForOperationalDay(tenantId, operationalDayId);
  }

  @Get(':id')
  findById(@Param('id') id: string, @Query('tenant_id') tenantId: string) {
    return this.shiftEntries.findById(id, tenantId);
  }
}
