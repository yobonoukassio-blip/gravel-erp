import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HseIncident } from './entities/hse-incident.entity';
import { HseAttachment } from './entities/hse-attachment.entity';
import { CorrectiveAction } from './entities/corrective-action.entity';
import { HseIncidentService } from './services/hse-incident.service';
import { HseAttachmentService } from './services/hse-attachment.service';
import { CorrectiveActionService } from './services/corrective-action.service';
import { TfCalculatorService } from './services/tf-calculator.service';
import { HseIncidentController } from './controllers/hse-incident.controller';
import { CorrectiveActionController } from './controllers/corrective-action.controller';

/**
 * HseModule (Phase 2 W3 P07).
 *
 * Implements:
 *   - HSE-01: append-only incident + chain-of-hash + S3 Object Lock attachments
 *   - HSE-02: CAPA workflow + severity≥4 closure guard
 *   - HSE-06: TF (taux fréquence) calculator
 *
 * Deferred to Phase 3:
 *   - HSE-03: EPI management (see docs/phase-03-handoff/hse-rh-deferred-scope.md)
 *   - HSE-04: Habilitations (see docs/phase-03-handoff/hse-rh-deferred-scope.md)
 *   - HSE-05: Safety audits (see docs/phase-03-handoff/hse-rh-deferred-scope.md)
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([HseIncident, HseAttachment, CorrectiveAction]),
    EventEmitterModule,
  ],
  controllers: [HseIncidentController, CorrectiveActionController],
  providers: [
    HseIncidentService,
    HseAttachmentService,
    CorrectiveActionService,
    TfCalculatorService,
  ],
  exports: [
    HseIncidentService,
    HseAttachmentService,
    CorrectiveActionService,
    TfCalculatorService,
  ],
})
export class HseModule {}
