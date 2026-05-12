import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { OutboxEvent } from './outbox-event.entity';

export interface PublishOutboxEventInput {
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  /**
   * Caller's EntityManager. MUST be the same EM used by the business
   * mutation so the outbox row commits atomically with the business row.
   */
  manager: EntityManager;
}

/**
 * Publishes a row into `outbox_event` inside the caller's transaction.
 *
 * Callers MUST be inside a transaction (use `dataSource.transaction(...)` or
 * `@Transaction()`) and pass `manager` from that transaction. Inserting via
 * a fresh EntityManager would defeat the whole point of the outbox.
 */
@Injectable()
export class OutboxService {
  async publish(input: PublishOutboxEventInput): Promise<OutboxEvent> {
    const repo = input.manager.getRepository(OutboxEvent);
    const row = repo.create({
      tenantId: input.tenantId,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      eventType: input.eventType,
      payload: input.payload,
      attempts: 0,
    });
    return repo.save(row);
  }
}
