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
import { StockpileEvent } from '../entities/stockpile-event.entity';
import { StockpileEventService } from '../services/stockpile-event.service';

interface AuthedRequest {
  user: { sub: string; tenantId: string; roles?: string[] };
}

interface AppendStockpileEventDto {
  site_id: string;
  stockpile_id: string;
  event_type:
    | 'STOCKPILE_INFLOW'
    | 'STOCKPILE_OUTFLOW_SALE'
    | 'STOCKPILE_ADJUSTMENT'
    | 'STOCKPILE_TRANSFER';
  tonnage_delta_kg: string | number;
  material_type: 'granite_brut' | 'tout_venant' | 'sterile';
  calibre_code: string;
  operational_day_id: string;
  source_reference?: Record<string, unknown>;
  occurred_at_utc: string;
  cost_per_ton_minor_units?: string | number | null;
  currency?: string | null;
}

/**
 * StockpileEvent controller — APPEND-ONLY surface.
 *
 * STK-01:
 *   POST /stockpile-events       → append event (chain-of-hash computed server-side)
 *   GET  /stockpile-events       → list
 *   PATCH/PUT/DELETE /...        → 405 Method Not Allowed
 */
@Controller('stockpile-events')
export class StockpileController {
  constructor(private readonly service: StockpileEventService) {}

  @Post()
  async append(
    @Body() dto: AppendStockpileEventDto,
    @Req() req: AuthedRequest,
  ): Promise<StockpileEvent> {
    const role = pickPrimaryRole(req.user.roles);
    return this.service.append({
      tenantId: req.user.tenantId,
      siteId: dto.site_id,
      stockpileId: dto.stockpile_id,
      eventType: dto.event_type,
      tonnageDeltaKg: BigInt(dto.tonnage_delta_kg),
      materialType: dto.material_type,
      calibreCode: dto.calibre_code,
      operationalDayId: dto.operational_day_id,
      sourceReference: dto.source_reference ?? {},
      occurredAtUtc: new Date(dto.occurred_at_utc),
      createdBy: req.user.sub,
      actorRole: role,
      costPerTonMinorUnits:
        dto.cost_per_ton_minor_units == null
          ? null
          : BigInt(dto.cost_per_ton_minor_units),
      currency: dto.currency ?? null,
    });
  }

  @Get()
  async list(
    @Query('stockpile_id') _stockpileId: string,
    @Req() _req: AuthedRequest,
  ): Promise<StockpileEvent[]> {
    // Read implementation deferred to controller-list spec (Task 4 wires UI).
    return [];
  }

  @All(':id')
  @HttpCode(HttpStatus.METHOD_NOT_ALLOWED)
  rejectMutation(@Param('id') _id: string): never {
    throw new HttpException(
      {
        code: 'METHOD_NOT_ALLOWED',
        message: 'stockpile_event is append-only.',
      },
      HttpStatus.METHOD_NOT_ALLOWED,
    );
  }
}

function pickPrimaryRole(roles: string[] | undefined): string {
  if (!roles || roles.length === 0) return 'UNKNOWN';
  // SITE_MANAGER wins if present; else first.
  if (roles.includes('SITE_MANAGER')) return 'SITE_MANAGER';
  return roles[0];
}
