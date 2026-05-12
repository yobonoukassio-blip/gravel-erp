import { TestBed } from '@angular/core/testing';
import { firstValueFrom, take, toArray } from 'rxjs';
import { SseClientService } from './sse-client.service';

/**
 * Tests for SseClientService.
 *
 * We mock the native EventSource constructor at the global scope. The
 * mock exposes test-only hooks to push messages, simulate errors, and
 * assert reconnect behavior with the persisted Last-Event-ID.
 */

type Listener = (e: MessageEvent | Event) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  listeners: Map<string, Listener[]> = new Map();
  closed = false;

  constructor(url: string, _opts?: EventSourceInit) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    const arr = this.listeners.get(type) ?? [];
    arr.push(listener);
    this.listeners.set(type, arr);
  }

  close(): void {
    this.closed = true;
  }

  // Test helpers ----------------------------------------------------
  pushMessage(data: unknown, lastEventId?: string): void {
    const evt = new MessageEvent('message', {
      data: JSON.stringify(data),
      lastEventId: lastEventId ?? '',
    });
    for (const l of this.listeners.get('message') ?? []) l(evt);
  }

  pushError(): void {
    for (const l of this.listeners.get('error') ?? []) l(new Event('error'));
  }
}

describe('SseClientService', () => {
  let svc: SseClientService;
  let originalEventSource: typeof EventSource;

  beforeEach(() => {
    originalEventSource = globalThis.EventSource;
    (globalThis as unknown as { EventSource: typeof MockEventSource }).EventSource =
      MockEventSource;
    MockEventSource.instances = [];
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [SseClientService] });
    svc = TestBed.inject(SseClientService);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    (globalThis as unknown as { EventSource: typeof EventSource }).EventSource =
      originalEventSource;
  });

  it('emits each parsed message to subscribers', async () => {
    const stream = svc.connect<{ tonnage: number }>('/api/sse/dashboard', {
      channel: 'dashboard-site-director',
    });
    const collector = firstValueFrom(stream.pipe(take(2), toArray()));
    const mock = MockEventSource.instances[0];
    mock.pushMessage({ tonnage: 1000 });
    mock.pushMessage({ tonnage: 1500 });
    const result = await collector;
    expect(result).toEqual([{ tonnage: 1000 }, { tonnage: 1500 }]);
  });

  it('persists Last-Event-ID into sessionStorage between messages', () => {
    const stream = svc.connect('/api/sse/dashboard', {
      channel: 'dashboard-site-director',
    });
    const sub = stream.subscribe();
    const mock = MockEventSource.instances[0];
    mock.pushMessage({ ok: true }, 'evt-42');
    expect(sessionStorage.getItem('gravel.sse.last_event_id.dashboard-site-director')).toBe(
      'evt-42',
    );
    sub.unsubscribe();
  });

  it('reconnect uses persisted Last-Event-ID in the URL query', () => {
    sessionStorage.setItem('gravel.sse.last_event_id.alerts', 'evt-99');
    const stream = svc.connect('/api/sse/alerts', { channel: 'alerts' });
    const sub = stream.subscribe();
    expect(MockEventSource.instances.length).toBe(1);
    expect(MockEventSource.instances[0].url).toContain('last_event_id=evt-99');

    // Force a reconnect.
    MockEventSource.instances[0].pushError();
    jest.advanceTimersByTime(1000);

    expect(MockEventSource.instances.length).toBeGreaterThanOrEqual(2);
    expect(MockEventSource.instances[1].url).toContain('last_event_id=evt-99');
    sub.unsubscribe();
  });

  it('closes the underlying EventSource when subscriber unsubscribes', () => {
    const stream = svc.connect('/api/sse/dashboard', { channel: 'dashboard' });
    const sub = stream.subscribe();
    expect(MockEventSource.instances[0].closed).toBe(false);
    sub.unsubscribe();
    expect(MockEventSource.instances[0].closed).toBe(true);
  });

  it('exhausts retries when maxRetries is set and surfaces an error', async () => {
    const stream = svc.connect('/api/sse/dashboard', { channel: 'limited', maxRetries: 1 });
    const errorPromise = new Promise<unknown>((resolve) => {
      stream.subscribe({ error: (err) => resolve(err) });
    });

    MockEventSource.instances[0].pushError(); // attempt = 1
    jest.advanceTimersByTime(1000);
    MockEventSource.instances[1].pushError(); // attempt = 2 — exhausted
    const err = await errorPromise;
    expect(String(err)).toMatch(/exhausted retries/);
  });
});
