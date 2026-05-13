import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatBadgeModule } from '@angular/material/badge';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { SseClientService } from '../../../core/sse/sse-client.service';

type AlertSseEvent = {
  kind: 'alert.count_updated';
  open_count: number;
};

/**
 * AlertBadgeComponent — header badge showing live open alert count.
 *
 * Subscribes to SSE channel `alerts:${tenantId}:${siteId}` for live
 * open-alert count updates. Displayed in the app shell header.
 * Clicking navigates to /alerts-inbox (DSH-01).
 */
@Component({
  selector: 'gravel-alert-badge',
  standalone: true,
  imports: [CommonModule, MatBadgeModule, MatIconModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a [routerLink]="['/alerts-inbox']"
       class="alert-badge-link"
       data-testid="alert-badge-link"
       [attr.aria-label]="'Alertes ouvertes: ' + openCount()">
      <mat-icon
        [matBadge]="openCount() > 0 ? openCount().toString() : null"
        matBadgeColor="warn"
        matBadgeSize="small"
        matBadgePosition="above after"
        data-testid="alert-icon"
      >notifications</mat-icon>
    </a>
  `,
  styles: [`
    .alert-badge-link { display: inline-flex; align-items: center; color: inherit; text-decoration: none; padding: 4px; }
  `],
})
export class AlertBadgeComponent implements OnInit, OnDestroy {
  private readonly sseClient = inject(SseClientService);

  readonly openCount = signal(0);

  private sseSubscription: Subscription | null = null;

  // In real app sourced from auth token / CLS
  private readonly tenantId = 'current';
  private readonly siteId = 'current';

  ngOnInit(): void {
    void this.loadInitialCount();
    this.connectSse();
  }

  ngOnDestroy(): void {
    this.sseSubscription?.unsubscribe();
  }

  private async loadInitialCount(): Promise<void> {
    try {
      const res = await fetch('/api/alerts?status=open', { credentials: 'include' });
      if (!res.ok) return;
      const alerts = (await res.json()) as unknown[];
      this.openCount.set(alerts.length);
    } catch {
      // Fail silently — badge will update on next SSE push
    }
  }

  private connectSse(): void {
    const channel = `alerts:${this.tenantId}:${this.siteId}`;
    this.sseSubscription = this.sseClient
      .connect<AlertSseEvent>(
        `/api/dashboards/site-director/stream?site_id=${this.siteId}`,
        { channel },
      )
      .subscribe({
        next: (evt) => {
          if (evt.kind === 'alert.count_updated') {
            this.openCount.set(evt.open_count);
          } else {
            // Any kpi.delta event may change alert counts — reload
            void this.loadInitialCount();
          }
        },
      });
  }
}
