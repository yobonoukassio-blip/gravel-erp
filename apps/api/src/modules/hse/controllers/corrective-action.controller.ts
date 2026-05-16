import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { CorrectiveAction, CapaStatus } from '../entities/corrective-action.entity';
import {
  CorrectiveActionService,
  CreateCorrectiveActionInput,
  TransitionInput,
} from '../services/corrective-action.service';

interface AuthedRequest {
  user: { userId: string; tenantId: string; role: string };
}

interface CreateCapaDto {
  incident_id: string;
  description: string;
  assigned_to_user_id: string;
  due_date_local: string;
  iana_timezone: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

interface TransitionCapaDto {
  status: CapaStatus;
  closed_evidence_attachments?: string[];
}

/**
 * CorrectiveActionController — CAPA lifecycle (HSE-02, D2-62).
 *
 * POST   /corrective-actions            → create CAPA (HSE_OFFICER or SITE_MANAGER)
 * GET    /corrective-actions/:id        → get CAPA detail
 * GET    /corrective-actions            → list by incident
 * PATCH  /corrective-actions/:id/status → transition status
 */
@Controller('corrective-actions')
export class CorrectiveActionController {
  constructor(private readonly service: CorrectiveActionService) {}

  @Post()
  async create(
    @Body() dto: CreateCapaDto,
    @Req() req: AuthedRequest,
  ): Promise<CorrectiveAction> {
    const input: CreateCorrectiveActionInput = {
      tenantId: req.user.tenantId,
      incidentId: dto.incident_id,
      description: dto.description,
      assignedToUserId: dto.assigned_to_user_id,
      dueDateLocal: dto.due_date_local,
      ianaTimezone: dto.iana_timezone,
      priority: dto.priority,
      createdBy: req.user.userId,
      actorRole: req.user.role,
    };
    return this.service.create(input);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
  ): Promise<CorrectiveAction> {
    return this.service.findById(id, req.user.tenantId);
  }

  @Get()
  async list(
    @Req() req: AuthedRequest,
    @Param('incident_id') incidentId?: string,
  ): Promise<CorrectiveAction[]> {
    if (!incidentId) return [];
    return this.service.listForIncident(incidentId, req.user.tenantId);
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  async transition(
    @Param('id') id: string,
    @Body() dto: TransitionCapaDto,
    @Req() req: AuthedRequest,
  ): Promise<CorrectiveAction> {
    const input: TransitionInput = {
      tenantId: req.user.tenantId,
      capaId: id,
      newStatus: dto.status,
      userId: req.user.userId,
      actorRole: req.user.role,
      closedEvidenceAttachments: dto.closed_evidence_attachments,
    };
    return this.service.transition(input);
  }
}

