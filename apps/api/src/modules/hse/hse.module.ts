import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CorrectiveAction } from './entities/corrective-action.entity';
import { EpiAssignment } from './entities/epi-assignment.entity';
import { EpiItem } from './entities/epi-item.entity';
import { HseAttachment } from './entities/hse-attachment.entity';
import { HseIncident } from './entities/hse-incident.entity';
import { CorrectiveActionController } from './controllers/corrective-action.controller';
import { EpiController } from './controllers/epi.controller';
import { HseIncidentController } from './controllers/hse-incident.controller';
import { CorrectiveActionService } from './services/corrective-action.service';
import { EpiService } from './services/epi.service';
import { HseAttachmentService } from './services/hse-attachment.service';
import { HseIncidentService } from './services/hse-incident.service';
import { TfCalculatorService } from './services/tf-calculator.service';

/**
 * HseModule.
 *
 * Implements:
 *   - HSE-01: append-only incident + chain-of-hash + S3 Object Lock attachments (Phase 2)
 *   - HSE-02: CAPA workflow + severity≥4 closure guard (Phase 2)
 *   - HSE-03: EPI management (Phase 3 — finalized 2026-05-17)
 *   - HSE-04: Habilitation gate (lives in RH module + wired into TIR/MNT/CAR)
 *   - HSE-06: TF (taux fréquence) calculator (Phase 2)
 *
 * Still deferred:
 *   - HSE-05: Safety audits — spec only (docs/phase-03-handoff/hse-05-audits-spec.md)
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      HseIncident,
      HseAttachment,
      CorrectiveAction,
      EpiItem,
      EpiAssignment,
    ]),
    EventEmitterModule,
  ],
  controllers: [
    HseIncidentController,
    CorrectiveActionController,
    EpiController,
  ],
  providers: [
    HseIncidentService,
    HseAttachmentService,
    CorrectiveActionService,
    TfCalculatorService,
    EpiService,
  ],
  exports: [
    HseIncidentService,
    HseAttachmentService,
    CorrectiveActionService,
    TfCalculatorService,
    EpiService,
  ],
})
export class HseModule {}
