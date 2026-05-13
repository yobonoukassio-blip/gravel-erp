import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  AppendExplosivesEventInput,
  ExplosivesLedgerService,
} from '../services/explosives-ledger.service';

@Controller('explosives-ledger')
export class ExplosivesLedgerController {
  constructor(private readonly ledger: ExplosivesLedgerService) {}

  /** POST /explosives-ledger — append a new ledger entry (EXPLOSIVES_IN, etc.) */
  @Post()
  async append(@Body() body: AppendExplosivesEventInput) {
    return this.ledger.append({
      ...body,
      quantityG: BigInt(body.quantityG as unknown as string),
    });
  }

  /** GET /explosives-ledger/balance/:siteId — running balance per product_type */
  @Get('balance/:siteId')
  async getBalance(
    @Param('siteId') siteId: string,
    @Query('tenantId') tenantId: string,
    @Query('operationalDayId') operationalDayId: string,
  ) {
    return this.ledger.getBalance(tenantId, siteId, operationalDayId);
  }
}
