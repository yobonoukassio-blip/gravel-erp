import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxEvent } from './outbox-event.entity';
import { OutboxService } from './outbox.service';
import { OutboxWorkerProcessor } from './outbox-worker.processor';

// EventEmitterModule.forRoot() est enregistré globalement dans AppModule.
@Module({
  imports: [TypeOrmModule.forFeature([OutboxEvent])],
  providers: [OutboxService, OutboxWorkerProcessor],
  exports: [OutboxService, TypeOrmModule],
})
export class OutboxModule {}
