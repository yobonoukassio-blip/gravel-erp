import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Alert } from './alert.entity';
import { AlertsController } from './alerts.controller';
import { AlertsEventHandlers } from './alerts.event-handlers';
import { AlertsService } from './alerts.service';

@Module({
  imports: [TypeOrmModule.forFeature([Alert])],
  controllers: [AlertsController],
  providers: [AlertsService, AlertsEventHandlers],
  exports: [AlertsService],
})
export class AlertsModule {}
