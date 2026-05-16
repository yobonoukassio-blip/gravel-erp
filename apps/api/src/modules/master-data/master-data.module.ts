import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Site } from './entities/site.entity';
import { ProductionZone } from './entities/production-zone.entity';
import { Bench } from './entities/bench.entity';
import { Permit } from './entities/permit.entity';
import { OperationalDay } from './entities/operational-day.entity';
import { Shift } from './entities/shift.entity';
import { FxRate } from './entities/fx-rate.entity';
import { ProductionEquipment } from './production-equipment.entity';
import { OperationalDayService } from './operational-day.service';
import { MasterDataService } from './master-data.service';
import { MasterDataController } from './master-data.controller';
import { ProductionEquipmentService } from './production-equipment.service';
import { ProductionEquipmentController } from './production-equipment.controller';
import { IdentityModule } from '../identity/identity.module';
import { SiteScopeGuard } from '../../common/guards/site-scope.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Site, ProductionZone, Bench, Permit, OperationalDay, Shift, FxRate, ProductionEquipment,
    ]),
    IdentityModule,
  ],
  controllers: [MasterDataController, ProductionEquipmentController],
  providers: [
    OperationalDayService,
    MasterDataService,
    ProductionEquipmentService,
    SiteScopeGuard,
    TenantGuard,
  ],
  exports: [OperationalDayService, MasterDataService, ProductionEquipmentService, TypeOrmModule],
})
export class MasterDataModule {}
