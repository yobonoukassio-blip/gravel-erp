import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@jsverse/transloco';
import { AuthService } from '../core/auth/auth.service';
import { LocaleSwitcherComponent } from './locale-switcher.component';

@Component({
  selector: 'gravel-header',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    TranslocoModule,
    LocaleSwitcherComponent,
  ],
  template: `
    <header class="gv-header" role="banner">
      <span class="gv-header-bar" aria-hidden="true"></span>

      <ng-container *ngIf="claims$ | async as claims; else anonymous">
        <div class="identity">
          <span class="identity-pill">{{ claims.role }}</span>
          <span class="identity-sites">
            <mat-icon class="identity-icon" aria-hidden="true">terrain</mat-icon>
            <span class="gv-num">{{ claims.siteIds.length }}</span>
            <span>{{ 'header.sites' | transloco }}</span>
          </span>
        </div>
      </ng-container>
      <ng-template #anonymous>
        <div class="identity identity-anonymous">{{ 'header.signed_out' | transloco }}</div>
      </ng-template>

      <span class="gv-spacer"></span>

      <div class="actions">
        <gravel-locale-switcher />
        <span class="actions-sep" aria-hidden="true"></span>
        <button
          mat-icon-button
          type="button"
          class="logout-btn"
          (click)="logout()"
          [attr.aria-label]="'header.logout' | transloco"
        >
          <mat-icon>logout</mat-icon>
        </button>
      </div>
    </header>
  `,
  styles: [
    `
      :host { display: block; position: sticky; top: 0; z-index: var(--gv-z-sticky); }

      .gv-header {
        position: relative;
        display: flex;
        align-items: center;
        gap: var(--gv-space-4);
        height: 60px;
        padding: 0 var(--gv-space-6);
        background: oklch(100% 0 0 / 0.78);
        backdrop-filter: saturate(180%) blur(10px);
        -webkit-backdrop-filter: saturate(180%) blur(10px);
        border-bottom: 1px solid var(--gv-border);
        animation: gv-fade-in var(--gv-duration-3) var(--gv-ease) both;
      }
      /* Gold accent bar across the bottom edge */
      .gv-header-bar {
        position: absolute;
        left: 0;
        right: 0;
        bottom: -1px;
        height: 1px;
        background: linear-gradient(90deg,
          transparent 0%,
          var(--gv-gold) 18%,
          var(--gv-gold-bright) 50%,
          var(--gv-gold) 82%,
          transparent 100%);
        opacity: 0.7;
      }

      .identity {
        display: inline-flex;
        align-items: center;
        gap: var(--gv-space-3);
      }
      .identity-pill {
        display: inline-flex;
        align-items: center;
        padding: 4px var(--gv-space-3);
        background: var(--gv-navy-800);
        color: oklch(96% 0.005 250);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        border-radius: 999px;
        box-shadow:
          inset 0 1px 0 oklch(100% 0 0 / 0.08),
          0 1px 2px oklch(20% 0.06 260 / 0.18);
      }
      .identity-pill::before {
        content: '';
        width: 6px;
        height: 6px;
        margin-right: 8px;
        border-radius: 50%;
        background: var(--gv-gold);
        box-shadow: 0 0 8px var(--gv-gold);
      }
      .identity-sites {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        color: var(--gv-text-muted);
      }
      .identity-icon {
        font-size: 16px !important;
        width: 16px !important;
        height: 16px !important;
        color: var(--gv-text-soft);
      }
      .identity-sites .gv-num {
        font-weight: 600;
        color: var(--gv-text);
      }
      .identity-anonymous { color: var(--gv-text-muted); font-style: italic; font-size: 13px; }

      .actions {
        display: inline-flex;
        align-items: center;
        gap: var(--gv-space-1);
      }
      .actions-sep {
        width: 1px;
        height: 22px;
        background: var(--gv-border);
        margin: 0 var(--gv-space-2);
      }

      .gv-spacer { flex: 1 1 auto; }

      .logout-btn { color: var(--gv-text-muted); transition: color var(--gv-duration-1) var(--gv-ease); }
      .logout-btn:hover { color: var(--gv-danger); }
    `,
  ],
})
export class HeaderComponent {
  private readonly auth = inject(AuthService);
  readonly claims$ = this.auth.userClaims$;

  logout(): void {
    this.auth.logout().subscribe();
  }
}
