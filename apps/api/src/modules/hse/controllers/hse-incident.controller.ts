import {
  All,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Delete,
  Query,
  Req,
} from '@nestjs/common';
import { HseIncident } from '../entities/hse-incident.entity';
import { HseIncidentService, CreateHseIncidentInput } from '../services/hse-incident.service';
import { HseAttachmentService } from '../services/hse-attachment.service';

interface AuthedRequest {
  user: { sub: string; tenantId: string; roles?: string[] };
}

interface CreateHseIncidentDto {
  site_id: string;
  occurred_at_local: string;
  iana_timezone: string;
  occurred_at_utc: string;
  operational_day_id: string;
  category: string;
  severity: number;
  location_text: string;
  gps_point?: string | null;
  people_impacted?: Array<{
    employee_id?: string;
    name?: string;
    injury_type?: string;
    body_part?: string;
    lost_time_h: number;
  }>;
  equipment_impacted_ids?: string[];
  chronology_md: string;
  content_addressed_attachments?: string[];
}

/**
 * HseIncidentController — APPEND-ONLY incident surface (D2-60, ADR-0008).
 *
 * POST   /hse-incidents         → create incident (chain-of-hash computed server-side)
 * GET    /hse-incidents         → list incidents
 * GET    /hse-incidents/:id     → get incident detail
 * POST   /hse-incidents/:id/close → close incident (severity≥4 guard enforced)
 * PATCH  /hse-incidents/:id     → 405 (append-only)
 * PUT    /hse-incidents/:id     → 405 (append-only)
 * DELETE /hse-incidents/:id     → 405 (append-only)
 *
 * POST   /hse-attachments/upload-url → pre-signed S3 PUT URL
 * POST   /hse-attachments/confirm    → confirm upload + persist row
 */
@Controller('hse-incidents')
export class HseIncidentController {
  constructor(
    private readonly service: HseIncidentService,
    private readonly attachmentService: HseAttachmentService,
  ) {}

  @Post()
  async create(
    @Body() dto: CreateHseIncidentDto,
    @Req() req: AuthedRequest,
  ): Promise<HseIncident> {
    const input: CreateHseIncidentInput = {
      tenantId: req.user.tenantId,
      siteId: dto.site_id,
      occurredAtLocal: new Date(dto.occurred_at_local),
      ianaTimezone: dto.iana_timezone,
      occurredAtUtc: new Date(dto.occurred_at_utc),
      operationalDayId: dto.operational_day_id,
      category: dto.category as CreateHseIncidentInput['category'],
      severity: dto.severity,
      reporterUserId: req.user.sub,
      locationText: dto.location_text,
      gpsPoint: dto.gps_point ?? null,
      peopleImpacted: dto.people_impacted ?? [],
      equipmentImpactedIds: dto.equipment_impacted_ids ?? [],
      chronologyMd: dto.chronology_md,
      contentAddressedAttachments: dto.content_addressed_attachments ?? [],
    };
    return this.service.create(input);
  }

  @Get()
  async list(
    @Req() req: AuthedRequest,
    @Query('site_id') siteId?: string,
  ): Promise<HseIncident[]> {
    return this.service.list(req.user.tenantId, siteId);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
  ): Promise<HseIncident> {
    return this.service.findById(id, req.user.tenantId);
  }

  @Post(':id/close')
  async close(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
  ): Promise<HseIncident> {
    return this.service.close(id, req.user.tenantId, req.user.sub);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.METHOD_NOT_ALLOWED)
  rejectPatch(@Param('id') _id: string): never {
    return this.service.rejectPatch();
  }

  @Put(':id')
  @HttpCode(HttpStatus.METHOD_NOT_ALLOWED)
  rejectPut(@Param('id') _id: string): never {
    return this.service.rejectPatch();
  }

  @Delete(':id')
  @HttpCode(HttpStatus.METHOD_NOT_ALLOWED)
  rejectDelete(@Param('id') _id: string): never {
    return this.service.rejectPatch();
  }
}
