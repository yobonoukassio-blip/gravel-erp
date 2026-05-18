import { Injectable, signal, computed } from '@angular/core';

export interface ApiFailure {
  readonly url: string;
  readonly method: string;
  readonly status: number;
  readonly at: Date;
}

/**
 * In-memory log of API failures that the silent-error interceptor swallowed.
 * The diagnostic banner subscribes to `failures` so the user can see at a
 * glance which endpoints are 404/500 instead of staring at empty grids.
 *
 * Deduped by `method+url+status` to avoid spamming the banner on retries.
 */
@Injectable({ providedIn: 'root' })
export class ApiDiagnosticsService {
  private readonly entries = signal<readonly ApiFailure[]>([]);

  readonly failures = computed(() => this.entries());
  readonly count = computed(() => this.entries().length);

  record(method: string, url: string, status: number): void {
    const key = `${method} ${url} ${status}`;
    const existing = this.entries();
    if (existing.some((e) => `${e.method} ${e.url} ${e.status}` === key)) {
      return;
    }
    this.entries.set([...existing, { method, url, status, at: new Date() }]);
  }

  clear(): void {
    this.entries.set([]);
  }
}
