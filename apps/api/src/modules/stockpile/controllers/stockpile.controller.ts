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
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

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
@Controller()
export class StockpileController {
  constructor(
    private readonly service: StockpileEventService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // ── Stockpiles listing (STK-00 read) ─────────────────────────────────────
  @Get('stockpiles')
  async listStockpiles(
    @Query('site_id') siteId?: string,
    @Query('siteId') siteIdAlt?: string,
  ): Promise<unknown[]> {
    const sid = siteId ?? siteIdAlt;
    return this.dataSource.transaction(async (em) => {
      const params: unknown[] = [];
      let where = '';
      if (sid) { params.push(sid); where = ' AND site_id = $1'; }
      return em.query(
        `SELECT * FROM stockpile WHERE is_active${where} ORDER BY code`,
        params,
      );
    });
  }

  // ── Stockpile balance projection (read) ──────────────────────────────────
  // Frontend StockpileListComponent renders one row per stockpile×calibre with
  // current balance, last refresh, weighted average cost.
  @Get('stockpile-balances')
  async listBalances(
    @Query('site_id') siteId?: string,
    @Query('siteId') siteIdAlt?: string,
    @Query('stockpile_id') stockpileId?: string,
  ): Promise<unknown[]> {
    const sid = siteId ?? siteIdAlt;
    return this.dataSource.transaction(async (em) => {
      const params: unknown[] = [];
      const where: string[] = [];
      if (sid) { params.push(sid); where.push(`sb.site_id = $${params.length}`); }
      if (stockpileId) { params.push(stockpileId); where.push(`sb.stockpile_id = $${params.length}`); }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      return em.query(
        `SELECT
           sb.tenant_id,
           sb.site_id,
           sb.stockpile_id,
           sb.calibre_code,
           sb.balance_kg::text       AS balance_kg,
           sb.last_event_id,
           sb.last_refresh_utc,
           sb.weighted_avg_cost_per_ton_minor_units::text AS weighted_avg_cost_per_ton_minor_units,
           sb.currency,
           s.code  AS stockpile_code,
           s.label AS stockpile_label
         FROM stockpile_balance sb
         LEFT JOIN stockpile s ON s.id = sb.stockpile_id AND s.tenant_id = sb.tenant_id
         ${whereSql}
         ORDER BY s.code NULLS LAST, sb.calibre_code`,
        params,
      );
    });
  }

  // ── Stockpile thresholds (read) ──────────────────────────────────────────
  // Frontend stockpile-thresholds.component renders criticalLow / low / high
  // bands per stockpile×calibre and lets quarry chiefs edit them later.
  @Get('stockpile-thresholds')
  async listThresholds(
    @Query('site_id') siteId?: string,
    @Query('siteId') siteIdAlt?: string,
    @Query('stockpile_id') stockpileId?: string,
  ): Promise<unknown[]> {
    const sid = siteId ?? siteIdAlt;
    return this.dataSource.transaction(async (em) => {
      const params: unknown[] = [];
      const where: string[] = [];
      if (sid) { params.push(sid); where.push(`s.site_id = $${params.length}`); }
      if (stockpileId) { params.push(stockpileId); where.push(`st.stockpile_id = $${params.length}`); }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      return em.query(
        `SELECT
           st.id,
           st.tenant_id,
           st.stockpile_id,
           st.calibre_code,
           st.critical_low_kg::text AS critical_low_kg,
           st.low_kg::text          AS low_kg,
           st.high_kg::text         AS high_kg,
           st.updated_by,
           st.updated_at,
           s.code  AS stockpile_code,
           s.label AS stockpile_label,
           s.site_id
         FROM stockpile_threshold st
         JOIN stockpile s ON s.id = st.stockpile_id AND s.tenant_id = st.tenant_id
         ${whereSql}
         ORDER BY s.code, st.calibre_code`,
        params,
      );
    });
  }

  @Post('stockpile-events')
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

  @Get('stockpile-events')
  async list(
    @Query('stockpile_id') _stockpileId: string,
    @Req() _req: AuthedRequest,
  ): Promise<StockpileEvent[]> {
    // Read implementation deferred to controller-list spec (Task 4 wires UI).
    return [];
  }

  @All('stockpile-events/:id')
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
