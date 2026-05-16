import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { Roles } from '../../identity/decorators/roles.decorator';
import { DetonatorService } from '../services/detonator.service';

// P0-8 (audit 2026-05-16): RBAC on detonator state machine. Lifecycle
// transitions (load / fire / return / destroy) are restricted to authorized
// operators. Reception requires CHEF_CARRIERE; firing requires
// CHEF_CARRIERE/QUARRY_CHIEF/SITE_MANAGER only.
@Controller('detonators')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DetonatorController {
  constructor(private readonly detonators: DetonatorService) {}

  /** POST /detonators/receive — receive detonator from an explosives_in event */
  @Post('receive')
  @Roles('CHEF_CARRIERE', 'QUARRY_CHIEF', 'SITE_MANAGER')
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
  @Roles('CHEF_CARRIERE', 'QUARRY_CHIEF', 'SITE_MANAGER')
  async load(
    @Param('serial') serial: string,
    @Body() body: { blastChargeId: string; tenantId: string },
  ) {
    return this.detonators.load(serial, body.blastChargeId, body.tenantId);
  }

  /** POST /detonators/:serial/fire — transition LOADED → FIRED */
  @Post(':serial/fire')
  @Roles('CHEF_CARRIERE', 'QUARRY_CHIEF', 'SITE_MANAGER')
  async fire(
    @Param('serial') serial: string,
    @Body() body: { tenantId: string },
  ) {
    return this.detonators.fire(serial, body.tenantId);
  }

  /** POST /detonators/:serial/return — transition LOADED → RETURNED */
  @Post(':serial/return')
  @Roles('CHEF_CARRIERE', 'QUARRY_CHIEF', 'SITE_MANAGER')
  async return(
    @Param('serial') serial: string,
    @Body() body: { tenantId: string },
  ) {
    return this.detonators.return(serial, body.tenantId);
  }

  /** POST /detonators/:serial/destroy — transition any → DESTROYED */
  @Post(':serial/destroy')
  @Roles('CHEF_CARRIERE', 'QUARRY_CHIEF', 'SITE_MANAGER', 'HSE', 'HSE_OFFICER')
  async destroy(
    @Param('serial') serial: string,
    @Body() body: { tenantId: string },
  ) {
    return this.detonators.destroy(serial, body.tenantId);
  }

  /** GET /detonators/:serial — fetch by serial */
  @Get(':serial')
  @Roles(
    'CHEF_CARRIERE',
    'QUARRY_CHIEF',
    'SITE_MANAGER',
    'DIRECTEUR_SITE',
    'DIRECTION_GROUPE',
    'HSE',
    'HSE_OFFICER',
  )
  async findBySerial(
    @Param('serial') serial: string,
    @Query('tenantId') tenantId: string,
  ) {
    return this.detonators.findBySerial(serial, tenantId);
  }
}
