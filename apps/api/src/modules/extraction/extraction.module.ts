import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExtractionCycle } from './entities/extraction-cycle.entity';
import { ExtractionCycleService } from './services/extraction-cycle.service';
import { ExtractionYieldService } from './services/extraction-yield.service';
import { ExtractionCycleController } from './controllers/extraction-cycle.controller';
import { MasterDataModule } from '../master-data/master-data.module';
import { ProductionEquipmentService } from '../master-data/production-equipment.service';
import { ProductionEquipment } from '../master-data/production-equipment.entity';

/**
 * Phase 2 Wave 1 — Extraction module (D2-20, D2-21).
 *
 * Wires ExtractionCycle append-only entity + yield calculation service.
 * Imports MasterDataModule for the active-equipment guard.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ExtractionCycle, ProductionEquipment]),
    MasterDataModule,
  ],
  controllers: [ExtractionCycleController],
  providers: [
    ExtractionCycleService,
    ExtractionYieldService,
    ProductionEquipmentService,
  ],
  exports: [ExtractionCycleService, ExtractionYieldService],
})
export class ExtractionModule {}
