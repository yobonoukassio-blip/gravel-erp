import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ApiDiagnosticsService } from '../core/http/api-diagnostics.service';

/**
 * Floating diagnostic badge — visible only when the silent-error interceptor
 * has swallowed at least one API failure. Lets the operator see which
 * endpoints are returning 404/500 instead of staring at empty grids.
 *
 * Click toggles a panel with the list of failing endpoints; X dismisses it
 * for the current session.
 */
@Component({
  selector: 'gravel-api-diagnostics-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  template: `
    @if (visible() && diag.count() > 0) {
      <div class="diag-root" role="status" aria-live="polite">
        @if (expanded()) {
          <div class="diag-panel">
            <header class="diag-head">
              <mat-icon class="diag-head-icon">warning</mat-icon>
              <span class="diag-head-title">{{ diag.count() }} endpoint(s) en erreur</span>
              <button type="button" class="diag-icon-btn" (click)="expanded.set(false)" aria-label="Réduire">
                <mat-icon>expand_more</mat-icon>
              </button>
              <button type="button" class="diag-icon-btn" (click)="visible.set(false)" aria-label="Masquer">
                <mat-icon>close</mat-icon>
              </button>
            </header>
            <ul class="diag-list">
              @for (f of diag.failures(); track f.url) {
                <li class="diag-item">
                  <span class="diag-status diag-status-{{ f.status }}">{{ f.status }}</span>
                  <span class="diag-method">{{ f.method }}</span>
                  <code class="diag-url" [title]="f.url">{{ shortPath(f.url) }}</code>
                </li>
              }
            </ul>
            <footer class="diag-foot">
              Affichage en lecture seule — les tableaux concernés restent vides tant que l'API ne répond pas.
            </footer>
          </div>
        } @else {
          <button type="button" class="diag-pill" (click)="expanded.set(true)" [attr.aria-label]="diag.count() + ' endpoints en erreur'">
            <mat-icon class="diag-pill-icon">warning</mat-icon>
            <span class="diag-pill-num">{{ diag.count() }}</span>
            <span class="diag-pill-text">API</span>
          </button>
        }
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }

    .diag-root {
      position: fixed;
      bottom: calc(var(--gv-space-4) + env(safe-area-inset-bottom));
      right: var(--gv-space-4);
      z-index: var(--gv-z-overlay);
      animation: gv-fade-up var(--gv-duration-3) var(--gv-ease) both;
    }

    .diag-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      background: var(--gv-danger);
      color: oklch(98% 0.005 25);
      border: none;
      border-radius: 999px;
      font-family: var(--gv-font-sans);
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.02em;
      cursor: pointer;
      box-shadow: 0 4px 16px oklch(58% 0.21 25 / 0.35);
      transition: transform var(--gv-duration-1) var(--gv-ease), box-shadow var(--gv-duration-2) var(--gv-ease);
    }
    .diag-pill:hover { transform: translateY(-1px); box-shadow: 0 6px 20px oklch(58% 0.21 25 / 0.45); }
    .diag-pill-icon { font-size: 16px !important; width: 16px !important; height: 16px !important; }
    .diag-pill-num { font-variant-numeric: tabular-nums; font-weight: 700; }
    .diag-pill-text { opacity: 0.92; }

    .diag-panel {
      width: min(420px, calc(100vw - var(--gv-space-6)));
      max-height: 60vh;
      background: var(--gv-surface);
      border: 1px solid var(--gv-border);
      border-radius: var(--gv-radius-md);
      box-shadow: var(--gv-shadow-3);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .diag-head {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      background: var(--gv-danger-soft);
      border-bottom: 1px solid var(--gv-border);
      color: oklch(35% 0.18 25);
    }
    .diag-head-icon { color: var(--gv-danger); font-size: 18px !important; width: 18px !important; height: 18px !important; }
    .diag-head-title { flex: 1 1 auto; font-size: 13px; font-weight: 600; }
    .diag-icon-btn {
      background: transparent;
      border: none;
      padding: 4px;
      color: oklch(40% 0.12 25);
      border-radius: var(--gv-radius-sm);
      cursor: pointer;
      display: inline-flex;
    }
    .diag-icon-btn:hover { background: oklch(92% 0.06 25); }
    .diag-icon-btn mat-icon { font-size: 18px !important; width: 18px !important; height: 18px !important; }

    .diag-list {
      list-style: none;
      margin: 0;
      padding: 4px 0;
      overflow-y: auto;
      flex: 1 1 auto;
    }
    .diag-item {
      display: grid;
      grid-template-columns: 44px 56px 1fr;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      font-size: 12px;
      border-bottom: 1px solid var(--gv-divider);
    }
    .diag-item:last-child { border-bottom: 0; }
    .diag-status {
      font-family: var(--gv-font-mono);
      font-weight: 700;
      text-align: center;
      padding: 2px 0;
      border-radius: var(--gv-radius-sm);
      background: oklch(94% 0.04 25);
      color: oklch(35% 0.18 25);
    }
    .diag-status-404 { background: oklch(94% 0.04 80); color: oklch(40% 0.16 75); }
    .diag-status-500 { background: oklch(94% 0.04 25); color: oklch(35% 0.18 25); }
    .diag-status-0   { background: oklch(92% 0.01 260); color: oklch(38% 0.06 260); }
    .diag-method {
      font-family: var(--gv-font-mono);
      font-size: 11px;
      color: var(--gv-text-muted);
      font-weight: 600;
    }
    .diag-url {
      font-family: var(--gv-font-mono);
      font-size: 11.5px;
      color: var(--gv-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }

    .diag-foot {
      padding: 8px 12px;
      font-size: 11px;
      color: var(--gv-text-muted);
      background: var(--gv-surface-2);
      border-top: 1px solid var(--gv-divider);
    }

    @media (max-width: 600px) {
      .diag-root { right: var(--gv-space-3); bottom: calc(var(--gv-space-3) + env(safe-area-inset-bottom)); }
    }
  `],
})
export class ApiDiagnosticsBannerComponent {
  readonly diag = inject(ApiDiagnosticsService);
  readonly visible = signal(true);
  readonly expanded = signal(false);

  shortPath(url: string): string {
    try {
      const u = new URL(url, window.location.origin);
      return u.pathname + u.search;
    } catch {
      return url;
    }
  }
}
