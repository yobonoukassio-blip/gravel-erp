import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { DetonatorService } from '../services/detonator.service';

@Controller('detonators')
export class DetonatorController {
  constructor(private readonly detonators: DetonatorService) {}

  /** POST /detonators/receive — receive detonator from an explosives_in event */
  @Post('receive')
  async receive(
    @Body() body: { serialNumber: string; receivedInEventId: string; tenantId: string },
  ) {
    return this.detonators.receiveFromEvent(
      body.serialNumber,
      body.receivedInEventId,
      body.tenantId,
    );
  }

  /** POST /detonators/:serial/load — transition IN_STOCK → LOADED */
  @Post(':serial/load')
  async load(
    @Param('serial') serial: string,
    @Body() body: { blastChargeId: string; tenantId: string },
  ) {
    return this.detonators.load(serial, body.blastChargeId, body.tenantId);
  }

  /** POST /detonators/:serial/fire — transition LOADED → FIRED */
  @Post(':serial/fire')
  async fire(
    @Param('serial') serial: string,
    @Body() body: { tenantId: string },
  ) {
    return this.detonators.fire(serial, body.tenantId);
  }

  /** POST /detonators/:serial/return — transition LOADED → RETURNED */
  @Post(':serial/return')
  async return(
    @Param('serial') serial: string,
    @Body() body: { tenantId: string },
  ) {
    return this.detonators.return(serial, body.tenantId);
  }

  /** POST /detonators/:serial/destroy — transition any → DESTROYED */
  @Post(':serial/destroy')
  async destroy(
    @Param('serial') serial: string,
    @Body() body: { tenantId: string },
  ) {
    return this.detonators.destroy(serial, body.tenantId);
  }

  /** GET /detonators/:serial — fetch by serial */
  @Get(':serial')
  async findBySerial(
    @Param('serial') serial: string,
    @Query('tenantId') tenantId: string,
  ) {
    return this.detonators.findBySerial(serial, tenantId);
  }
}
