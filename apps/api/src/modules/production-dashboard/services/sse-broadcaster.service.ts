import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';

/** One buffered SSE event. */
interface SseEvent {
  id: number;
  payload: unknown;
}

/** Active subscriber: one browser tab / client connection. */
interface Subscriber {
  res: Response;
}

/**
 * SSE broadcast ring-buffer capacity per channel (last N events).
 * Enables Last-Event-ID replay on reconnect.
 */
const RING_BUFFER_SIZE = 100;

/**
 * SseBroadcasterService (D2-71, ADR-0010).
 *
 * Maintains an in-memory registry of SSE channels.
 * Channel key scheme: `${tenantId}:${siteId}:${dashboardKey}`
 *
 * - register(channelKey, res, lastEventId?)  — subscribe a Response and
 *   optionally replay buffered events after lastEventId.
 * - emit(channelKey, payload)               — broadcast to all subscribers.
 * - unregister(channelKey, res)             — remove on disconnect.
 *
 * Each emit line format: `id: N\ndata: <json>\n\n` (standard SSE).
 */
@Injectable()
export class SseBroadcasterService {
  private readonly logger = new Logger(SseBroadcasterService.name);

  /** channel → live subscribers */
  private readonly subscribers = new Map<string, Set<Subscriber>>();

  /** channel → ring-buffer of recent events */
  private readonly ringBuffers = new Map<string, SseEvent[]>();

  /** channel → monotonic event counter */
  private readonly counters = new Map<string, number>();

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Register a new SSE client.
   * If `lastEventId` is provided, replays any buffered events with id > lastEventId
   * before adding to the live set.
   */
  register(channelKey: string, res: Response, lastEventId?: string): void {
    if (!this.subscribers.has(channelKey)) {
      this.subscribers.set(channelKey, new Set());
      this.ringBuffers.set(channelKey, []);
      this.counters.set(channelKey, 0);
    }

    const sub: Subscriber = { res };

    // Replay buffered events on reconnect
    if (lastEventId !== undefined) {
      const lastId = parseInt(lastEventId, 10);
      const buffer = this.ringBuffers.get(channelKey) ?? [];
      const missed = buffer.filter((e) => !isNaN(lastId) && e.id > lastId);
      if (missed.length > 0) {
        this.logger.log(
          `Replaying ${missed.length} events on channel ${channelKey} (Last-Event-ID: ${lastEventId})`,
        );
        for (const evt of missed) {
          this.writeEvent(res, evt.id, evt.payload);
        }
      } else {
        // Nothing to replay; hint the client to refresh the snapshot
        this.writeComment(res, 'refresh-snapshot');
      }
    }

    this.subscribers.get(channelKey)!.add(sub);
    this.logger.log(`Client registered on channel ${channelKey}`);
  }

  /**
   * Emit a payload to all subscribers of a channel.
   * Buffers the event for Last-Event-ID replay.
   */
  emit(channelKey: string, payload: unknown): void {
    const counter = (this.counters.get(channelKey) ?? 0) + 1;
    this.counters.set(channelKey, counter);

    // Add to ring buffer
    const buffer = this.ringBuffers.get(channelKey) ?? [];
    buffer.push({ id: counter, payload });
    if (buffer.length > RING_BUFFER_SIZE) {
      buffer.shift(); // evict oldest
    }
    this.ringBuffers.set(channelKey, buffer);

    // Broadcast
    const subs = this.subscribers.get(channelKey);
    if (!subs || subs.size === 0) return;

    const dead: Subscriber[] = [];
    for (const sub of subs) {
      try {
        this.writeEvent(sub.res, counter, payload);
      } catch (err) {
        this.logger.warn(
          `Write failed on channel ${channelKey}, removing subscriber: ${(err as Error).message}`,
        );
        dead.push(sub);
      }
    }

    for (const sub of dead) {
      subs.delete(sub);
    }
  }

  /**
   * Remove a specific client from a channel (called on connection close).
   */
  unregister(channelKey: string, res: Response): void {
    const subs = this.subscribers.get(channelKey);
    if (!subs) return;
    for (const sub of subs) {
      if (sub.res === res) {
        subs.delete(sub);
        this.logger.log(`Client unregistered from channel ${channelKey}`);
        return;
      }
    }
  }

  /** Subscriber count for a channel (useful for tests). */
  subscriberCount(channelKey: string): number {
    return this.subscribers.get(channelKey)?.size ?? 0;
  }

  /** Buffer snapshot for a channel (useful for tests). */
  buffer(channelKey: string): SseEvent[] {
    return this.ringBuffers.get(channelKey) ?? [];
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private writeEvent(res: Response, id: number, payload: unknown): void {
    // Standard SSE format per HTML5 spec
    res.write(`id: ${id}\ndata: ${JSON.stringify(payload)}\n\n`);
    // Flush if available (compression middleware etc.)
    if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
      (res as unknown as { flush: () => void }).flush();
    }
  }

  private writeComment(res: Response, comment: string): void {
    res.write(`: ${comment}\n\n`);
  }
}
