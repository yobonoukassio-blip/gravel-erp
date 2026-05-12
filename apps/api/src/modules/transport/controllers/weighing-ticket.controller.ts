import {
  All,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { WeighingTicket } from '../entities/weighing-ticket.entity';
import { WeighingTicketService } from '../services/weighing-ticket.service';

interface AuthedRequest {
  user: { sub: string; tenantId: string };
}

interface CreateWeighingTicketDto {
  site_id: string;
  ticket_number: string;
  gross_kg: number;
  tare_kg: number;
  truck_equipment_id: string;
  driver_id: string;
  material_type: 'granite_brut' | 'tout_venant' | 'sterile';
  weighed_at_local: string;
  iana_timezone: string;
  operational_day_id: string;
  weighing_station_code: string;
  client_signature_blob_sha256?: string | null;
  driver_signature_blob_sha256?: string | null;
  notes?: string | null;
  is_offline_generated: boolean;
  content_hash: string;
}

/**
 * WeighingTicket controller — APPEND-ONLY (TRP-02).
 *
 * POST /weighing-tickets  → create
 * GET  /weighing-tickets  → list by operational_day_id
 * GET  /weighing-tickets/:id → fetch one
 * PATCH/PUT/DELETE        → 405
 */
@Controller('weighing-tickets')
export class WeighingTicketController {
  constructor(private readonly service: WeighingTicketService) {}

  @Post()
  async create(
    @Body() dto: CreateWeighingTicketDto,
    @Req() req: AuthedRequest,
  ): Promise<WeighingTicket> {
    return this.service.create({
      tenantId: req.user.tenantId,
      siteId: dto.site_id,
      ticketNumber: dto.ticket_number,
      grossKg: dto.gross_kg,
      tareKg: dto.tare_kg,
      truckEquipmentId: dto.truck_equipment_id,
      driverId: dto.driver_id,
      materialType: dto.material_type,
      weighedAtLocal: new Date(dto.weighed_at_local),
      ianaTimezone: dto.iana_timezone,
      operationalDayId: dto.operational_day_id,
      operatorUserId: req.user.sub,
      weighingStationCode: dto.weighing_station_code,
      clientSignatureBlobSha256: dto.client_signature_blob_sha256 ?? null,
      driverSignatureBlobSha256: dto.driver_signature_blob_sha256 ?? null,
      notes: dto.notes ?? null,
      isOfflineGenerated: dto.is_offline_generated,
      clientContentHash: dto.content_hash,
      createdBy: req.user.sub,
    });
  }

  @Get()
  async list(
    @Query('operational_day_id') operationalDayId: string,
    @Req() req: AuthedRequest,
  ): Promise<WeighingTicket[]> {
    return this.service.listForOperationalDay(
      operationalDayId,
      req.user.tenantId,
    );
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
  ): Promise<WeighingTicket> {
    return this.service.findById(id, req.user.tenantId);
  }

  /** Append-only enforcement: PATCH/PUT/DELETE → 405. */
  @All(':id')
  @HttpCode(HttpStatus.METHOD_NOT_ALLOWED)
  rejectMutation(): never {
    throw new HttpException(
      {
        code: 'METHOD_NOT_ALLOWED',
        message:
          'weighing_ticket is append-only. Submit a correction event (Phase 3).',
      },
      HttpStatus.METHOD_NOT_ALLOWED,
    );
  }
}
