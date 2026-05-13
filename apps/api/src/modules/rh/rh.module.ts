import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from './entities/employee.entity';
import { CertificationType } from './entities/certification-type.entity';
import { EmployeeCertification } from './entities/employee-certification.entity';
import { ShiftEntry } from './entities/shift-entry.entity';
import { ShiftRoster } from './entities/shift-roster.entity';
import { Subcontractor } from './entities/subcontractor.entity';
import { RhHabilitationService } from './services/rh-habilitation.service';
import { EmployeeService } from './services/employee.service';
import { SubcontractorService } from './services/subcontractor.service';
import { ShiftEntryService } from './services/shift-entry.service';
import { ShiftRosterService } from './services/shift-roster.service';
import { EmployeeController } from './controllers/employee.controller';
import { ShiftEntryController } from './controllers/shift-entry.controller';
import { ShiftRosterController } from './controllers/shift-roster.controller';
import { SubcontractorController } from './controllers/subcontractor.controller';

/**
 * RhModule (Phase 3 W0-P01).
 *
 * Implements:
 *   - RH-01: Employee + subcontractor entities with RLS
 *   - RH-02: ShiftEntry append-only + mobile offline capture
 *   - RH-03: ShiftRoster mutable with pessimistic_lock
 *   - RH-04: EmployeeCertification with temporal validity
 *   - HSE-04: RhHabilitationService.isValidAt() — habilitation gate for TIR W1-P02 and MNT W2-P04
 *
 * Exported: RhHabilitationService (injected by downstream modules TIR, MNT)
 *           EmployeeService (used for blockClosure/resolveClosure on OperationalDay)
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Employee,
      CertificationType,
      EmployeeCertification,
      ShiftEntry,
      ShiftRoster,
      Subcontractor,
    ]),
    EventEmitterModule,
  ],
  controllers: [
    EmployeeController,
    ShiftEntryController,
    ShiftRosterController,
    SubcontractorController,
  ],
  providers: [
    RhHabilitationService,
    EmployeeService,
    SubcontractorService,
    ShiftEntryService,
    ShiftRosterService,
  ],
  exports: [
    RhHabilitationService,
    EmployeeService,
    SubcontractorService,
    ShiftEntryService,
    ShiftRosterService,
  ],
})
export class RhModule {}
