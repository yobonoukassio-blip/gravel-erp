import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkOrder } from './entities/work-order.entity';
import { PreventiveMaintenancePlan } from './entities/preventive-maintenance-plan.entity';
import { SparePart } from './entities/spare-part.entity';
import { SparePartConsumption } from './entities/spare-part-consumption.entity';
import { EquipmentAvailability } from './entities/equipment-availability.entity';
import { WorkOrderService } from './services/work-order.service';
import { SparePartService } from './services/spare-part.service';
import { MtbfCalculatorService } from './services/mtbf-calculator.service';
import { MaintenanceController } from './controllers/maintenance.controller';

/**
 * MaintenanceModule (Phase 3 W2 P04).
 * Wires:
 *   - WorkOrder lifecycle (MNT-03) with equipment status transitions
 *   - PreventiveMaintenancePlan + scheduler (MNT-02)
 *   - SparePart inventory with SELECT FOR UPDATE consumption (MNT-04)
 *   - MTBF/MTTR availability projection (MNT-05)
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkOrder,
      PreventiveMaintenancePlan,
      SparePart,
      SparePartConsumption,
      EquipmentAvailability,
    ]),
    EventEmitterModule,
  ],
  controllers: [MaintenanceController],
  providers: [WorkOrderService, SparePartService, MtbfCalculatorService],
  exports: [WorkOrderService, SparePartService, MtbfCalculatorService],
})
export class MaintenanceModule {}
