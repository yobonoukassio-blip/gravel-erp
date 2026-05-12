import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Site } from './entities/site.entity';
import { ProductionZone } from './entities/production-zone.entity';
import { Bench } from './entities/bench.entity';
import { Permit } from './entities/permit.entity';
import { OperationalDay } from './entities/operational-day.entity';
import { Shift } from './entities/shift.entity';
import { FxRate } from './entities/fx-rate.entity';
import { OperationalDayService } from './operational-day.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Site, ProductionZone, Bench, Permit, OperationalDay, Shift, FxRate]),
  ],
  providers: [OperationalDayService],
  exports: [OperationalDayService, TypeOrmModule],
})
export class MasterDataModule {}
