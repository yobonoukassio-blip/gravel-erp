import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatBadgeModule } from '@angular/material/badge';
import { interval, Subscription, switchMap, startWith, catchError, of } from 'rxjs';

interface NotificationItem {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly severity: 'info' | 'warning' | 'high' | 'critical';
  readonly eventType: string | null;
  readonly readAtUtc: string | null;
  readonly createdAtUtc: string;
  readonly alertId: string | null;
}

interface NotificationListResponse {
  readonly unreadCount: number;
  readonly items: readonly NotificationItem[];
}

/**
 * NotificationBadgeComponent (NTF-03-T02).
 *
 * Polls GET /api/notifications?unread=true every 30 seconds and displays an
 * icon badge with the unread count. Clicking the icon opens an inline dropdown
 * showing the latest notifications; clicking a notification row marks it as
 * read via PATCH /api/notifications/:id/read.
 *
 * Design: compositor-friendly transition on badge, no layout-bound animation.
 * Polling replaces SSE for v1.1 simplicity — SSE can be wired later when the
 * NestJS SSE broadcaster is set up for notifications.
 */
@Component({
  selector: 'gravel-notification-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatBadgeModule],
  template: `
    <div class="ntf-root" [class.ntf-open]="isOpen()">
      <!-- Bell button -->
      <button
        mat-icon-button
        type="button"
        class="ntf-bell"
        (click)="toggleDropdown()"
        [attr.aria-label]="unreadCount() > 0 ? ('Notifications — ' + unreadCount() + ' non lues') : 'Notifications'"
        [attr.aria-expanded]="isOpen()"
        aria-haspopup="true"
      >
        <mat-icon
          class="ntf-icon"
          [matBadge]="unreadCount() > 0 ? unreadCount().toString() : null"
          matBadgeColor="warn"
          matBadgeSize="small"
          [matBadgeHidden]="unreadCount() === 0"
        >notifications</mat-icon>
      </button>

      <!-- Dropdown panel -->
      @if (isOpen()) {
        <div class="ntf-panel" role="menu" aria-label="Notifications récentes">
          <div class="ntf-panel-header">
            <span class="ntf-panel-title">Notifications</span>
            @if (unreadCount() > 0) {
              <button
                class="ntf-mark-all"
                type="button"
                (click)="markAllRead()"
              >Tout lire</button>
            }
          </div>

          @if (items().length === 0) {
            <p class="ntf-empty">Aucune notification récente.</p>
          } @else {
            <ul class="ntf-list" role="list">
              @for (item of items(); track item.id) {
                <li
                  class="ntf-item"
                  [class.ntf-item--unread]="!item.readAtUtc"
                  [attr.data-severity]="item.severity"
                  role="menuitem"
                  (click)="markRead(item)"
                >
                  <span class="ntf-severity-dot"></span>
                  <span class="ntf-content">
                    <span class="ntf-item-title">{{ item.title }}</span>
                    <span class="ntf-item-body">{{ item.body }}</span>
                    <time class="ntf-item-time" [attr.datetime]="item.createdAtUtc">
                      {{ formatTime(item.createdAtUtc) }}
                    </time>
                  </span>
                </li>
              }
            </ul>
          }
        </div>

        <!-- Backdrop to close on outside click -->
        <div class="ntf-backdrop" (click)="closeDropdown()" aria-hidden="true"></div>
      }
    </div>
  `,
  styles: [
    `
      .ntf-root {
        position: relative;
        display: inline-flex;
        align-items: center;
      }

      .ntf-bell {
        color: var(--gv-text-muted);
        transition: color var(--gv-duration-1) var(--gv-ease);
      }
      .ntf-bell:hover,
      .ntf-open .ntf-bell {
        color: var(--gv-text);
      }

      .ntf-icon {
        font-size: 22px !important;
        width: 22px !important;
        height: 22px !important;
      }

      /* Dropdown panel */
      .ntf-panel {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        z-index: var(--gv-z-dropdown, 200);
        width: 340px;
        max-height: 420px;
        overflow-y: auto;
        background: oklch(100% 0 0 / 0.96);
        backdrop-filter: blur(12px);
        border: 1px solid var(--gv-border);
        border-radius: 10px;
        box-shadow:
          0 4px 6px -1px oklch(20% 0.06 260 / 0.08),
          0 10px 24px -4px oklch(20% 0.06 260 / 0.12);
        animation: ntf-slide-in 120ms var(--gv-ease, cubic-bezier(0.16,1,0.3,1)) both;
      }

      @keyframes ntf-slide-in {
        from { opacity: 0; transform: translateY(-6px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      .ntf-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px 8px;
        border-bottom: 1px solid var(--gv-border);
      }
      .ntf-panel-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--gv-text);
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }
      .ntf-mark-all {
        font-size: 11px;
        color: var(--gv-text-muted);
        background: none;
        border: none;
        cursor: pointer;
        padding: 2px 0;
        text-decoration: underline;
        transition: color var(--gv-duration-1);
      }
      .ntf-mark-all:hover { color: var(--gv-gold); }

      .ntf-empty {
        padding: 20px 16px;
        font-size: 13px;
        color: var(--gv-text-muted);
        text-align: center;
        margin: 0;
      }

      .ntf-list {
        list-style: none;
        margin: 0;
        padding: 4px 0;
      }

      .ntf-item {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 10px 16px;
        cursor: pointer;
        border-bottom: 1px solid oklch(50% 0 0 / 0.06);
        transition: background var(--gv-duration-1);
      }
      .ntf-item:last-child { border-bottom: none; }
      .ntf-item:hover { background: oklch(98% 0 0); }
      .ntf-item--unread { background: oklch(98% 0.005 250 / 0.4); }

      /* Severity dot */
      .ntf-severity-dot {
        flex-shrink: 0;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-top: 5px;
        background: var(--gv-text-muted);
      }
      [data-severity="info"]     .ntf-severity-dot { background: var(--gv-navy-500, #3b82f6); }
      [data-severity="warning"]  .ntf-severity-dot { background: #a16207; }
      [data-severity="high"]     .ntf-severity-dot { background: #c2410c; }
      [data-severity="critical"] .ntf-severity-dot { background: #b91c1c; box-shadow: 0 0 6px #b91c1c; }

      .ntf-content {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .ntf-item-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--gv-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .ntf-item-body {
        font-size: 12px;
        color: var(--gv-text-muted);
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
      .ntf-item-time {
        font-size: 11px;
        color: oklch(60% 0 0);
        margin-top: 2px;
      }

      /* Backdrop */
      .ntf-backdrop {
        position: fixed;
        inset: 0;
        z-index: calc(var(--gv-z-dropdown, 200) - 1);
      }
    `,
  ],
})
export class NotificationBadgeComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);

  readonly unreadCount = signal<number>(0);
  readonly items = signal<NotificationItem[]>([]);
  readonly isOpen = signal(false);

  private pollSub: Subscription | null = null;
  private readonly POLL_INTERVAL_MS = 30_000;

  ngOnInit(): void {
    this.pollSub = interval(this.POLL_INTERVAL_MS)
      .pipe(
        startWith(0),
        switchMap(() =>
          this.http
            .get<NotificationListResponse>('/api/notifications?unread=true', {
              withCredentials: true,
            })
            .pipe(catchError(() => of(null))),
        ),
      )
      .subscribe((res) => {
        if (res) {
          this.unreadCount.set(res.unreadCount);
          this.items.set([...res.items]);
        }
      });
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
  }

  toggleDropdown(): void {
    this.isOpen.update((v) => !v);
  }

  closeDropdown(): void {
    this.isOpen.set(false);
  }

  markRead(item: NotificationItem): void {
    if (item.readAtUtc) return; // already read
    this.http
      .patch<{ ok: true }>(`/api/notifications/${item.id}/read`, {}, { withCredentials: true })
      .pipe(catchError(() => of(null)))
      .subscribe(() => {
        // Optimistic update: mark locally as read and decrement count.
        this.items.update((list) =>
          list.map((n) =>
            n.id === item.id ? { ...n, readAtUtc: new Date().toISOString() } : n,
          ),
        );
        this.unreadCount.update((c) => Math.max(0, c - 1));
      });
  }

  markAllRead(): void {
    this.http
      .patch<{ ok: true; updated: number }>('/api/notifications/read-all', {}, { withCredentials: true })
      .pipe(catchError(() => of(null)))
      .subscribe(() => {
        this.items.update((list) =>
          list.map((n) => ({ ...n, readAtUtc: n.readAtUtc ?? new Date().toISOString() })),
        );
        this.unreadCount.set(0);
      });
  }

  formatTime(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return "À l'instant";
    if (diffMin < 60) return `Il y a ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `Il y a ${diffH}h`;
    return d.toLocaleDateString('fr-CI', { day: 'numeric', month: 'short' });
  }
}
