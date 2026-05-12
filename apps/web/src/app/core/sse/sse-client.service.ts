import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { Observable, Subject } from 'rxjs';

/**
 * SSE client wrapper (D2-71).
 *
 * Wraps the browser-native `EventSource` with:
 *   - exponential backoff reconnect on error
 *   - per-channel persistence of `Last-Event-ID` in `sessionStorage` so
 *     a reload resumes from where the user left off
 *   - NgZone awareness so emitted events trigger change detection
 *
 * Used by Phase 2 dashboards (Site Director, Quarry Chief). One-way
 * server push only — bidirectional WebSocket is deferred Phase 4+ per
 * ADR-0010.
 */

export interface SseConnectOptions {
  /** Channel key used as sessionStorage key suffix. */
  channel: string;
  /** Override the last seen id (defaults to value read from sessionStorage). */
  lastEventId?: string;
  /** Max reconnect attempts before giving up (default: infinite). */
  maxRetries?: number;
}

interface ActiveConnection {
  source: EventSource;
  closed: boolean;
}

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 30_000;
const STORAGE_PREFIX = 'gravel.sse.last_event_id.';

@Injectable({ providedIn: 'root' })
export class SseClientService implements OnDestroy {
  private readonly active = new Map<string, ActiveConnection>();

  constructor(private readonly zone: NgZone) {}

  ngOnDestroy(): void {
    for (const [, conn] of this.active) {
      conn.closed = true;
      conn.source.close();
    }
    this.active.clear();
  }

  /**
   * Open an SSE stream on `url`. Returns an Observable that emits each
   * decoded `MessageEvent.data` (parsed as JSON) and completes when
   * the consumer unsubscribes (the underlying EventSource is closed).
   */
  connect<T>(url: string, opts: SseConnectOptions): Observable<T> {
    const subject = new Subject<T>();
    let attempt = 0;

    const open = (): void => {
      const storageKey = `${STORAGE_PREFIX}${opts.channel}`;
      const persistedLastId =
        opts.lastEventId ?? sessionStorage.getItem(storageKey) ?? undefined;

      const target = this.appendLastEventId(url, persistedLastId);

      const source = new EventSource(target, { withCredentials: true });
      const conn: ActiveConnection = { source, closed: false };
      this.active.set(opts.channel, conn);

      source.addEventListener('message', (e: MessageEvent) => {
        attempt = 0;
        if (e.lastEventId) {
          sessionStorage.setItem(storageKey, e.lastEventId);
        }
        this.zone.run(() => {
          try {
            subject.next(JSON.parse(e.data) as T);
          } catch {
            // Server may send non-JSON keepalives; ignore silently.
          }
        });
      });

      source.addEventListener('error', () => {
        if (conn.closed) return;
        source.close();
        attempt += 1;
        if (opts.maxRetries !== undefined && attempt > opts.maxRetries) {
          subject.error(new Error(`SSE channel ${opts.channel} exhausted retries`));
          return;
        }
        const delay = Math.min(RECONNECT_BASE_MS * 2 ** (attempt - 1), RECONNECT_MAX_MS);
        setTimeout(() => {
          if (!conn.closed) open();
        }, delay);
      });
    };

    open();

    return new Observable<T>((subscriber) => {
      const sub = subject.subscribe(subscriber);
      return () => {
        const conn = this.active.get(opts.channel);
        if (conn) {
          conn.closed = true;
          conn.source.close();
          this.active.delete(opts.channel);
        }
        sub.unsubscribe();
      };
    });
  }

  /**
   * Append `last_event_id` as a query parameter. The server may also read
   * the `Last-Event-ID` header but the native browser EventSource does not
   * expose a way to set it explicitly — query string is the portable path.
   */
  private appendLastEventId(url: string, lastEventId: string | undefined): string {
    if (!lastEventId) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}last_event_id=${encodeURIComponent(lastEventId)}`;
  }
}
