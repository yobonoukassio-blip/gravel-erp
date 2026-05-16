import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { Roles } from '../../identity/decorators/roles.decorator';
import {
  AppendExplosivesEventInput,
  ExplosivesLedgerService,
} from '../services/explosives-ledger.service';

// P0-8 (audit 2026-05-16): RBAC on append-only explosives ledger. Append
// requires explosives-authorized roles. Balance read is permitted for
// auditors / management as well.
@Controller('explosives-ledger')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExplosivesLedgerController {
  constructor(private readonly ledger: ExplosivesLedgerService) {}

  /** POST /explosives-ledger — append a new ledger entry (EXPLOSIVES_IN, etc.) */
  @Post()
  @Roles('CHEF_CARRIERE', 'QUARRY_CHIEF', 'SITE_MANAGER')
  async append(@Body() body: AppendExplosivesEventInput) {
    return this.ledger.append({
      ...body,
      quantityG: BigInt(body.quantityG as unknown as string),
    });
  }

  /** GET /explosives-ledger/balance/:siteId — running balance per product_type */
  @Get('balance/:siteId')
  @Roles(
    'CHEF_CARRIERE',
    'QUARRY_CHIEF',
    'SITE_MANAGER',
    'DIRECTEUR_SITE',
    'DIRECTION_GROUPE',
    'HSE',
    'HSE_OFFICER',
    'FINANCE',
  )
  async getBalance(
    @Param('siteId') siteId: string,
    @Query('tenantId') tenantId: string,
    @Query('operationalDayId') operationalDayId: string,
  ) {
    return this.ledger.getBalance(tenantId, siteId, operationalDayId);
  }
}
