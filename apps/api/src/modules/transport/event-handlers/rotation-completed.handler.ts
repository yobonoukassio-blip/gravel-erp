import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ROTATION_COMPLETED_EVENT } from '../services/truck-rotation.service';

/**
 * Local observer for `production.transport.rotation_completed` outbox
 * events. Phase 2 P05 will add a stockpile-side consumer; this handler
 * exists in P04 as a structured trace / sanity sink so the outbox worker
 * has at least one subscriber while the cross-module bus is being wired.
 *
 * Payload shape (see TruckRotationService.completeWithManager):
 *   { rotation_id, weighing_ticket_id, loaded_tonnage_t, material_type,
 *     stockpile_id_target, operational_day_id, occurred_at_utc, ... }
 */
@Injectable()
export class RotationCompletedHandler {
  private readonly logger = new Logger('RotationCompletedHandler');

  @OnEvent(ROTATION_COMPLETED_EVENT)
  handle(event: {
    outboxId?: string;
    payload: Record<string, unknown>;
  }): void {
    const { rotation_id, stockpile_id_target, loaded_tonnage_t } =
      event.payload as {
        rotation_id: string;
        stockpile_id_target: string;
        loaded_tonnage_t: string;
      };
    this.logger.log(
      `rotation_completed rotation=${rotation_id} stockpile=${stockpile_id_target} tonnage=${loaded_tonnage_t}`,
    );
  }
}
