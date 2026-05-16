import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

interface FinanceTab {
  readonly path: string;
  readonly icon: string;
  readonly label: string;
}

/**
 * FinanceShellComponent — tab strip + outlet for the Finance feature.
 * Wraps consolidation / budget / ohada-export pages.
 */
@Component({
  selector: 'gravel-finance-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell">
      <nav class="tabs" aria-label="Navigation Finance">
        @for (tab of tabs; track tab.path) {
          <a
            [routerLink]="['/finance', tab.path]"
            routerLinkActive="is-active"
            class="tab"
          >
            <mat-icon class="tab-icon" aria-hidden="true">{{ tab.icon }}</mat-icon>
            <span class="tab-label">{{ tab.label }}</span>
          </a>
        }
      </nav>

      <div class="outlet">
        <router-outlet />
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .shell { display: flex; flex-direction: column; gap: var(--gv-space-5); }

    .tabs {
      display: inline-flex;
      gap: 4px;
      padding: 4px;
      background: var(--gv-surface);
      border: 1px solid var(--gv-border);
      border-radius: var(--gv-radius);
      box-shadow: var(--gv-shadow-1);
      align-self: flex-start;
    }
    .tab {
      display: inline-flex;
      align-items: center;
      gap: var(--gv-space-2);
      padding: 8px 14px;
      border-radius: var(--gv-radius-sm);
      font-size: 13px;
      font-weight: 600;
      color: var(--gv-text-muted);
      text-decoration: none;
      transition: background-color var(--gv-duration-2) var(--gv-ease),
                  color var(--gv-duration-2) var(--gv-ease);
    }
    .tab:hover {
      background: var(--gv-surface-2);
      color: var(--gv-text);
    }
    .tab.is-active {
      background: var(--gv-navy-800);
      color: var(--gv-gold-bright);
      box-shadow: 0 1px 2px oklch(20% 0.06 260 / 0.18),
                  inset 0 1px 0 oklch(100% 0 0 / 0.06);
    }
    .tab.is-active .tab-icon { color: var(--gv-gold-bright); }
    .tab-icon {
      font-size: 16px !important;
      width: 16px !important;
      height: 16px !important;
      color: var(--gv-text-soft);
    }
  `],
})
export class FinanceShellComponent {
  readonly tabs: readonly FinanceTab[] = [
    { path: 'consolidation', icon: 'insights', label: 'Consolidation' },
    { path: 'budget', icon: 'fact_check', label: 'Budget vs Réel' },
    { path: 'ohada-export', icon: 'file_download', label: 'Export OHADA' },
  ];
}
