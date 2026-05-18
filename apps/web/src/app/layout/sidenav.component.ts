import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

interface NavItem {
  readonly path: string;
  readonly icon: string;
  readonly label: string;
}

interface NavSection {
  readonly id: string;
  readonly label?: string;
  readonly items: readonly NavItem[];
}

@Component({
  selector: 'gravel-sidenav',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  template: `
    <div class="brand" aria-label="Gravel Ivoire">
      <div class="brand-mark" aria-hidden="true">
        <span class="brand-glyph">GV</span>
        <span class="brand-spark"></span>
      </div>
      <div class="brand-text">
        <span class="brand-name">Gravel Ivoire</span>
        <span class="brand-tag">Quarry Operations</span>
      </div>
    </div>

    <nav class="nav" aria-label="Primary">
      <ng-container *ngFor="let section of sections; let first = first">
        <div *ngIf="!first" class="nav-divider" aria-hidden="true"></div>
        <div *ngIf="section.label" class="nav-section">{{ section.label }}</div>
        <ul class="nav-list">
          <li *ngFor="let item of section.items">
            <a
              [routerLink]="item.path"
              routerLinkActive="is-active"
              class="nav-link"
              (click)="navigate.emit()"
            >
              <span class="nav-indicator" aria-hidden="true"></span>
              <mat-icon class="nav-icon" aria-hidden="true">{{ item.icon }}</mat-icon>
              <span class="nav-label">{{ item.label }}</span>
            </a>
          </li>
        </ul>
      </ng-container>
    </nav>

    <footer class="nav-foot" aria-hidden="true">
      <span class="foot-dot"></span>
      <span class="foot-text">Système opérationnel</span>
    </footer>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background:
        linear-gradient(180deg,
          var(--gv-navy-900) 0%,
          var(--gv-navy-800) 50%,
          var(--gv-navy-900) 100%);
      color: var(--gv-nav-text);
      font-family: var(--gv-font-sans);
      position: relative;
      overflow: hidden;
    }
    /* Subtle ambient gold glow at top of sidenav */
    :host::before {
      content: '';
      position: absolute;
      top: -80px;
      left: -40px;
      right: -40px;
      height: 200px;
      background: radial-gradient(ellipse at center top,
        oklch(78% 0.16 85 / 0.18) 0%,
        transparent 70%);
      pointer-events: none;
      z-index: 0;
    }

    .brand {
      position: relative;
      display: flex;
      align-items: center;
      gap: var(--gv-space-3);
      padding: var(--gv-space-4) var(--gv-space-5);
      border-bottom: 1px solid oklch(28% 0.08 260);
      min-height: 64px;
      z-index: 1;
    }
    .brand-mark {
      position: relative;
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background:
        radial-gradient(circle at 30% 30%,
          oklch(86% 0.18 92) 0%,
          oklch(72% 0.18 80) 40%,
          oklch(54% 0.15 70) 100%);
      display: grid;
      place-items: center;
      box-shadow:
        0 1px 2px oklch(0% 0 0 / 0.4),
        inset 0 1px 0 oklch(100% 0 0 / 0.25),
        0 0 0 1px oklch(60% 0.18 80 / 0.4);
      overflow: hidden;
      transition: transform var(--gv-duration-2) var(--gv-ease);
    }
    .brand:hover .brand-mark { transform: rotate(-2deg) scale(1.04); }
    .brand-glyph {
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.06em;
      color: oklch(22% 0.08 70);
      text-shadow: 0 1px 0 oklch(100% 0 0 / 0.3);
      z-index: 1;
    }
    .brand-spark {
      position: absolute;
      inset: -50%;
      background: linear-gradient(115deg,
        transparent 30%,
        oklch(100% 0 0 / 0.55) 50%,
        transparent 70%);
      transform: translateX(-100%);
      transition: transform var(--gv-duration-5) var(--gv-ease);
    }
    .brand:hover .brand-spark { transform: translateX(100%); }

    .brand-text { display: flex; flex-direction: column; min-width: 0; }
    .brand-name {
      font-size: 14px;
      font-weight: 600;
      letter-spacing: -0.005em;
      color: oklch(98% 0.005 250);
    }
    .brand-tag {
      font-size: 10.5px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--gv-gold);
    }

    .nav {
      flex: 1 1 auto;
      overflow-y: auto;
      padding: var(--gv-space-3) var(--gv-space-3) var(--gv-space-6);
      position: relative;
      z-index: 1;
    }

    .nav-section {
      padding: var(--gv-space-4) var(--gv-space-3) var(--gv-space-2);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.12em;
      color: var(--gv-nav-text-mute);
      text-transform: uppercase;
    }

    .nav-divider {
      height: 1px;
      margin: var(--gv-space-2) var(--gv-space-3);
      background: linear-gradient(to right,
        transparent,
        oklch(28% 0.08 260) 30%,
        oklch(28% 0.08 260) 70%,
        transparent);
    }

    .nav-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .nav-link {
      position: relative;
      display: grid;
      grid-template-columns: 20px 1fr;
      align-items: center;
      gap: var(--gv-space-3);
      padding: 9px var(--gv-space-3) 9px 16px;
      border-radius: var(--gv-radius);
      color: var(--gv-nav-text);
      font-size: 13px;
      font-weight: 500;
      text-decoration: none;
      transition: background-color var(--gv-duration-2) var(--gv-ease),
                  color var(--gv-duration-2) var(--gv-ease),
                  padding-left var(--gv-duration-2) var(--gv-ease);
      overflow: hidden;
    }
    .nav-link::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg,
        oklch(78% 0.16 85 / 0.08) 0%,
        transparent 60%);
      opacity: 0;
      transition: opacity var(--gv-duration-2) var(--gv-ease);
      pointer-events: none;
    }
    .nav-link:hover {
      background: var(--gv-nav-bg-soft);
      color: oklch(98% 0.005 250);
      padding-left: 18px;
    }
    .nav-link:hover::after { opacity: 1; }
    .nav-link:focus-visible {
      outline: 2px solid var(--gv-gold);
      outline-offset: -2px;
    }

    /* Sliding gold indicator on the left */
    .nav-indicator {
      position: absolute;
      left: 6px;
      top: 50%;
      width: 3px;
      height: 0;
      background: linear-gradient(180deg,
        var(--gv-gold-bright) 0%,
        var(--gv-gold) 100%);
      border-radius: 2px;
      transform: translateY(-50%);
      transition: height var(--gv-duration-3) var(--gv-ease),
                  box-shadow var(--gv-duration-3) var(--gv-ease);
    }

    .nav-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      line-height: 18px;
      color: var(--gv-nav-text-mute);
      transition: color var(--gv-duration-2) var(--gv-ease),
                  transform var(--gv-duration-2) var(--gv-ease);
    }
    .nav-link:hover .nav-icon { color: var(--gv-gold); transform: scale(1.05); }

    /* Active — full row tint + sliding gold bar + glow */
    .nav-link.is-active {
      background: var(--gv-nav-active);
      color: var(--gv-nav-active-text);
      padding-left: 18px;
    }
    .nav-link.is-active .nav-indicator {
      height: 60%;
      box-shadow: 0 0 12px oklch(78% 0.16 85 / 0.6);
    }
    .nav-link.is-active .nav-icon {
      color: var(--gv-gold-bright);
    }
    .nav-link.is-active .nav-label { font-weight: 600; }

    /* Footer status */
    .nav-foot {
      display: flex;
      align-items: center;
      gap: var(--gv-space-2);
      padding: var(--gv-space-3) var(--gv-space-5);
      border-top: 1px solid oklch(28% 0.08 260);
      font-size: 11px;
      color: var(--gv-nav-text-mute);
      z-index: 1;
      position: relative;
    }
    .foot-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--gv-success);
      box-shadow: 0 0 0 3px oklch(64% 0.16 152 / 0.2),
                  0 0 8px oklch(64% 0.16 152 / 0.6);
      animation: gv-pulse-dot 2.4s var(--gv-ease) infinite;
    }

    /* Smooth, momentum-friendly scroll inside the nav list */
    .nav {
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
    }

    /* Touch-friendly tap targets on small screens */
    @media (max-width: 960px) {
      .brand { padding: var(--gv-space-4) var(--gv-space-4); min-height: 60px; }
      .nav { padding: var(--gv-space-2) var(--gv-space-2) var(--gv-space-8); }
      .nav-link {
        padding: 12px var(--gv-space-3) 12px 16px;
        font-size: 14px;
      }
      .nav-link:hover { padding-left: 18px; }
      .nav-icon { font-size: 20px; width: 20px; height: 20px; line-height: 20px; }
      .nav-foot { padding: var(--gv-space-3) var(--gv-space-4) calc(var(--gv-space-3) + env(safe-area-inset-bottom)); }
    }
  `],
})
export class SidenavComponent {
  @Output() readonly navigate = new EventEmitter<void>();

  readonly sections: readonly NavSection[] = [
    {
      id: 'overview',
      items: [
        { path: '/dashboard',     icon: 'dashboard',     label: 'Dashboard' },
        { path: '/alerts-inbox',  icon: 'notifications', label: 'Alertes' },
      ],
    },
    {
      id: 'production',
      label: 'Production',
      items: [
        { path: '/foration',   icon: 'construction',     label: 'Foration' },
        { path: '/tir',        icon: 'bolt',             label: 'Tir de mine' },
        { path: '/extraction', icon: 'landscape',        label: 'Extraction' },
        { path: '/concassage', icon: 'precision_manufacturing', label: 'Concassage' },
        { path: '/transport',  icon: 'local_shipping',   label: 'Transport' },
        { path: '/stockpile',  icon: 'inventory_2',      label: 'Stockpile' },
      ],
    },
    {
      id: 'commercial',
      label: 'Commercial',
      items: [
        { path: '/ventes',  icon: 'receipt_long',     label: 'Ventes & BL' },
        { path: '/finance', icon: 'account_balance',  label: 'Finance' },
      ],
    },
    {
      id: 'operations',
      label: 'Opérations',
      items: [
        { path: '/fuel',        icon: 'local_gas_station', label: 'Carburant' },
        { path: '/maintenance', icon: 'build',             label: 'Maintenance' },
        { path: '/hse',         icon: 'health_and_safety', label: 'HSE' },
        { path: '/rh',          icon: 'badge',             label: 'RH' },
      ],
    },
    {
      id: 'admin',
      label: 'Administration',
      items: [
        { path: '/sites',        icon: 'terrain',  label: 'Sites' },
        { path: '/activity-log', icon: 'list_alt', label: 'Journal activité' },
      ],
    },
  ];
}
