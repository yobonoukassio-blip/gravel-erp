import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxEvent } from './outbox-event.entity';
import { OutboxService } from './outbox.service';
import { OutboxWorkerProcessor } from './outbox-worker.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([OutboxEvent]),
    EventEmitterModule.forRoot({ wildcard: true, maxListeners: 50 }),
  ],
  providers: [OutboxService, OutboxWorkerProcessor],
  exports: [OutboxService, TypeOrmModule],
})
export class OutboxModule {}
