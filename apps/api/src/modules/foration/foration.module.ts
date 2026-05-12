import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MasterDataModule } from '../master-data/master-data.module';
import { ProductionEquipmentService } from '../master-data/production-equipment.service';
import { ProductionEquipment } from '../master-data/production-equipment.entity';
import { DrilledHoleController } from './controllers/drilled-hole.controller';
import { DrillingPlanController } from './controllers/drilling-plan.controller';
import { DrilledHole } from './entities/drilled-hole.entity';
import { DrillingPlan } from './entities/drilling-plan.entity';
import { ForationEventHandlers } from './event-handlers/drilled-hole.handler';
import { DrilledHoleService } from './services/drilled-hole.service';
import { DrillingPlanService } from './services/drilling-plan.service';
import { DrillingYieldService } from './services/drilling-yield.service';

/**
 * ForationModule (Phase 2 W1 P02) — wires:
 *   - DrillingPlan (D2-10, FOR-01) + status state machine
 *   - DrilledHole append-only (D2-11, FOR-02)
 *   - Drilling yield m/h MV (D2-13, FOR-03)
 *   - Fuel liters consumed (D2-11 field — FOR-04)
 *   - Foreuse en panne bloque activation (D2-14, FOR-05)
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([DrillingPlan, DrilledHole, ProductionEquipment]),
    EventEmitterModule,
    MasterDataModule,
  ],
  controllers: [DrillingPlanController, DrilledHoleController],
  providers: [
    DrillingPlanService,
    DrilledHoleService,
    DrillingYieldService,
    ForationEventHandlers,
    ProductionEquipmentService,
  ],
  exports: [DrillingPlanService, DrilledHoleService, DrillingYieldService],
})
export class ForationModule {}
