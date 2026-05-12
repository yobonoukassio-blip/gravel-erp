import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MasterDataModule } from '../master-data/master-data.module';
import { ProductionEquipment } from '../master-data/production-equipment.entity';
import { ProductionEquipmentService } from '../master-data/production-equipment.service';
import { OutboxEvent } from '../outbox/outbox-event.entity';
import { OutboxService } from '../outbox/outbox.service';
import { TruckRotationController } from './controllers/truck-rotation.controller';
import { WeighingTicketController } from './controllers/weighing-ticket.controller';
import { TruckRotation } from './entities/truck-rotation.entity';
import { WeighingTicket } from './entities/weighing-ticket.entity';
import { RotationCompletedHandler } from './event-handlers/rotation-completed.handler';
import { TicketNumberGeneratorService } from './services/ticket-number-generator.service';
import { TruckRotationService } from './services/truck-rotation.service';
import { WeighingTicketService } from './services/weighing-ticket.service';

/**
 * TransportModule (Phase 2 W2 P04).
 *
 * Wires:
 *   - WeighingTicket (TRP-02): offline numbering + content_hash + signatures
 *   - TruckRotation (TRP-01): append-only, outbox dispatch on completion
 *   - Manual dispatch (TRP-03): POST /rotations/:id/assign
 *   - rotation_completed event handler (consumed by P05 stockpile)
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      WeighingTicket,
      TruckRotation,
      ProductionEquipment,
      OutboxEvent,
    ]),
    EventEmitterModule,
    MasterDataModule,
  ],
  controllers: [WeighingTicketController, TruckRotationController],
  providers: [
    WeighingTicketService,
    TicketNumberGeneratorService,
    TruckRotationService,
    RotationCompletedHandler,
    ProductionEquipmentService,
    OutboxService,
  ],
  exports: [WeighingTicketService, TruckRotationService],
})
export class TransportModule {}
