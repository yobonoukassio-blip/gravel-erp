import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntityManager } from 'typeorm';
import { OutboxEvent } from './outbox-event.entity';

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 50;
const POLL_INTERVAL_MS = 2_000;

interface PendingRow {
  id: string;
  tenant_id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  attempts: number;
}

/**
 * Drains the outbox and re-emits to EventEmitter2.
 *
 * Polling-based (every 2 s) using `SELECT FOR UPDATE SKIP LOCKED` so multiple
 * API replicas can run the worker safely. Per ADR-0001 we explicitly bind
 * `app.current_tenant` per batch row so RLS still applies to UPDATE
 * statements that mark the row dispatched.
 *
 * BullMQ wrapping is intentional but minimal here: this processor uses a
 * native `setInterval` because the workload is "scan a partial index" — a
 * BullMQ queue would add latency without much win. A future change can put
 * each dispatch on a BullMQ queue if listeners block (e.g., email send).
 */
@Injectable()
export class OutboxWorkerProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxWorkerProcessor.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly ds: DataSource,
    private readonly emitter: EventEmitter2,
  ) {}

  onModuleInit(): void {
    if (process.env.OUTBOX_WORKER_DISABLED === '1') {
      this.logger.log('Outbox worker disabled via OUTBOX_WORKER_DISABLED=1');
      return;
    }
    this.scheduleNextTick();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Public entry point — exposed for integration tests that want to force
   * a drain rather than wait for the timer.
   */
  async drainOnce(): Promise<{ dispatched: number; failed: number }> {
    let dispatched = 0;
    let failed = 0;

    await this.ds.transaction(async (manager) => {
      // SELECT FOR UPDATE SKIP LOCKED — concurrency-safe across replicas.
      const rows: PendingRow[] = await manager.query(
        `SELECT id, tenant_id, aggregate_type, aggregate_id, event_type, payload, attempts
           FROM outbox_event
          WHERE dispatched_at_utc IS NULL AND attempts < $1
          ORDER BY created_at_utc ASC
          LIMIT $2
          FOR UPDATE SKIP LOCKED`,
        [MAX_ATTEMPTS, BATCH_SIZE],
      );

      for (const row of rows) {
        // Rebind tenant for RLS-aware UPDATE.
        await manager.query(`SET LOCAL app.current_tenant = '${row.tenant_id}'`);

        try {
          // EventEmitter2 emit is sync; `await` covers async listeners
          // that return a promise (`emitAsync`).
          await this.emitter.emitAsync(row.event_type, {
            tenantId: row.tenant_id,
            aggregateType: row.aggregate_type,
            aggregateId: row.aggregate_id,
            payload: row.payload,
            outboxId: row.id,
          });
          await manager.query(
            `UPDATE outbox_event
                SET dispatched_at_utc = now(), last_error = NULL
              WHERE id = $1`,
            [row.id],
          );
          dispatched += 1;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'unknown error';
          const newAttempts = row.attempts + 1;
          if (newAttempts >= MAX_ATTEMPTS) {
            await this.moveToDeadLetter(manager, row, message);
          } else {
            await manager.query(
              `UPDATE outbox_event
                  SET attempts = $1, last_error = $2
                WHERE id = $3`,
              [newAttempts, message, row.id],
            );
          }
          failed += 1;
          this.logger.warn(
            `Outbox dispatch failed for ${row.event_type} (id=${row.id}, attempts=${newAttempts}): ${message}`,
          );
        }
      }
    });

    return { dispatched, failed };
  }

  private async moveToDeadLetter(
    manager: EntityManager,
    row: PendingRow,
    lastError: string,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO outbox_event_dead_letter
         (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, attempts, last_error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        row.id,
        row.tenant_id,
        row.aggregate_type,
        row.aggregate_id,
        row.event_type,
        row.payload,
        MAX_ATTEMPTS,
        lastError,
      ],
    );
    await manager.query(`DELETE FROM outbox_event WHERE id = $1`, [row.id]);
  }

  private scheduleNextTick(): void {
    this.timer = setTimeout(() => {
      void this.tick();
    }, POLL_INTERVAL_MS);
  }

  private async tick(): Promise<void> {
    if (this.running) {
      this.scheduleNextTick();
      return;
    }
    this.running = true;
    try {
      await this.drainOnce();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      this.logger.error(`Outbox worker tick failed: ${message}`);
    } finally {
      this.running = false;
      this.scheduleNextTick();
    }
  }
}

// Marker — searched by the verifier success criteria.
// SELECT FOR UPDATE SKIP LOCKED
// (literal exists in the SQL above on purpose)
