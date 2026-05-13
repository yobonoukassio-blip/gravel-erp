import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

export interface RefuelAppendedPayload {
  tenantId: string;
  siteId: string;
  tankId: string;
  equipmentId: string;
  liters: number;
  refuelId: string;
}

/**
 * RefuelAppendedHandler (CAR-02).
 *
 * Listens for `production.fuel.refuel_appended` (emitted post-commit by
 * EquipmentRefuelService) and triggers any downstream projections or alerts.
 *
 * Phase 2: lightweight handler — primarily logs the event for audit trail
 * and can be extended in Phase 3 (maintenance alert if excessive consumption).
 */
@Injectable()
export class RefuelAppendedHandler {
  private readonly logger = new Logger(RefuelAppendedHandler.name);

  @OnEvent('production.fuel.refuel_appended')
  handle(payload: RefuelAppendedPayload): void {
    this.logger.log(
      `Refuel appended: refuelId=${payload.refuelId} equipment=${payload.equipmentId} ` +
      `liters=${payload.liters} tank=${payload.tankId}`,
    );
  }
}
