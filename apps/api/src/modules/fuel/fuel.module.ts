import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RhModule } from '../rh/rh.module';
import { FuelTank } from './entities/fuel-tank.entity';
import { FuelTankEvent } from './entities/fuel-tank-event.entity';
import { EquipmentRefuel } from './entities/equipment-refuel.entity';
import { EquipmentFuelConsumption } from './entities/equipment-fuel-consumption.entity';
import { EnergyConsumptionReading } from './entities/energy-consumption-reading.entity';
import { FuelTankEventService } from './services/fuel-tank-event.service';
import { EquipmentRefuelService } from './services/equipment-refuel.service';
import { FuelAnomalyService } from './services/fuel-anomaly.service';
import { FuelReconciliationService } from './services/fuel-reconciliation.service';
import { EnergyConsumptionService } from './services/energy-consumption.service';
import { FuelCostAllocatorService } from './services/fuel-cost-allocator.service';
import { FuelController } from './controllers/fuel.controller';
import { RefuelAppendedHandler } from './event-handlers/refuel-appended.handler';
import { FuelAnomalyDetectionJob } from './jobs/fuel-anomaly-detection.job';
import { FuelReconciliationJob } from './jobs/fuel-reconciliation.job';

/**
 * FuelModule (Phase 2 W3 P06).
 *
 * Wires:
 *   - FuelTank master + FuelTankEvent append-only ledger + chain-of-hash (CAR-01)
 *   - EquipmentRefuel + EquipmentFuelConsumption (atomic 3-insert tx) (CAR-02)
 *   - FuelAnomalyService — L/h rolling detection (CAR-03)
 *   - FuelReconciliationService — nightly theoretical vs projected drift (CAR-01)
 *   - EnergyConsumptionReading — manual monthly readings (CAR-04)
 *   - FuelAnomalyDetectionJob (04:00 UTC cron)
 *   - FuelReconciliationJob (03:30 UTC cron)
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      FuelTank,
      FuelTankEvent,
      EquipmentRefuel,
      EquipmentFuelConsumption,
      EnergyConsumptionReading,
    ]),
    EventEmitterModule,
    ScheduleModule.forRoot(),
    RhModule,
  ],
  controllers: [FuelController],
  providers: [
    FuelTankEventService,
    EquipmentRefuelService,
    FuelAnomalyService,
    FuelReconciliationService,
    EnergyConsumptionService,
    FuelCostAllocatorService,
    RefuelAppendedHandler,
    FuelAnomalyDetectionJob,
    FuelReconciliationJob,
  ],
  exports: [
    FuelTankEventService,
    EquipmentRefuelService,
    FuelAnomalyService,
    FuelReconciliationService,
    EnergyConsumptionService,
    FuelCostAllocatorService,
  ],
})
export class FuelModule {}
