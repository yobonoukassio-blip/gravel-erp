import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'gravel-login',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, TranslocoModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="login-shell">
      <div class="bg-grid" aria-hidden="true"></div>
      <div class="bg-glow bg-glow-tl" aria-hidden="true"></div>
      <div class="bg-glow bg-glow-br" aria-hidden="true"></div>

      <article class="card" role="main">
        <header class="card-head">
          <div class="brand-mark" aria-hidden="true">
            <span class="brand-glyph">GV</span>
            <span class="brand-spark"></span>
          </div>
          <div class="brand-text">
            <span class="brand-eyebrow">GRAVEL IVOIRE</span>
            <h1 class="brand-name">ERP Carrière</h1>
            <p class="brand-tag">Quarry Operations</p>
          </div>
        </header>

        <div class="card-body">
          <p class="welcome">{{ 'login.subtitle' | transloco }}</p>

          <button
            mat-flat-button
            color="primary"
            type="button"
            (click)="login()"
            class="login-btn"
            data-testid="login-button"
          >
            <mat-icon>login</mat-icon>
            <span>{{ 'login.button' | transloco }}</span>
          </button>

          <ul class="capabilities" aria-label="Capabilities">
            <li>
              <mat-icon aria-hidden="true">verified_user</mat-icon>
              <span>SSO Keycloak · MFA</span>
            </li>
            <li>
              <mat-icon aria-hidden="true">cloud_off</mat-icon>
              <span>Saisie terrain offline-first</span>
            </li>
            <li>
              <mat-icon aria-hidden="true">analytics</mat-icon>
              <span>Dashboards consolidés temps réel</span>
            </li>
          </ul>
        </div>

        <footer class="card-foot">
          <span class="foot-status">
            <span class="status-dot"></span>
            Système opérationnel
          </span>
          <span class="foot-version">v0.1.0</span>
        </footer>
      </article>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .login-shell {
      position: relative;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: var(--gv-space-6);
      background:
        linear-gradient(180deg,
          var(--gv-navy-900) 0%,
          var(--gv-navy-800) 50%,
          var(--gv-navy-900) 100%);
      overflow: hidden;
    }

    /* Grid pattern */
    .bg-grid {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(oklch(100% 0 0 / 0.04) 1px, transparent 1px),
        linear-gradient(90deg, oklch(100% 0 0 / 0.04) 1px, transparent 1px);
      background-size: 56px 56px;
      mask-image: radial-gradient(ellipse at center, oklch(0% 0 0) 0%, transparent 75%);
      pointer-events: none;
    }
    /* Gold glow top-left */
    .bg-glow {
      position: absolute;
      border-radius: 50%;
      filter: blur(120px);
      pointer-events: none;
      opacity: 0.55;
    }
    .bg-glow-tl {
      top: -180px;
      left: -120px;
      width: 440px; height: 440px;
      background: radial-gradient(circle, oklch(78% 0.16 85) 0%, transparent 70%);
    }
    .bg-glow-br {
      bottom: -180px;
      right: -120px;
      width: 440px; height: 440px;
      background: radial-gradient(circle, oklch(36% 0.12 260) 0%, transparent 70%);
    }

    .card {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 440px;
      background: linear-gradient(180deg,
        var(--gv-surface) 0%,
        var(--gv-surface-2) 100%);
      border: 1px solid var(--gv-border);
      border-radius: var(--gv-radius-lg);
      box-shadow:
        0 1px 2px oklch(0% 0 0 / 0.3),
        0 24px 60px oklch(0% 0 0 / 0.35);
      overflow: hidden;
      animation: gv-fade-up var(--gv-duration-4) var(--gv-ease) both;
    }

    .card-head {
      display: flex;
      align-items: center;
      gap: var(--gv-space-4);
      padding: var(--gv-space-6) var(--gv-space-6) var(--gv-space-5);
      border-bottom: 1px solid var(--gv-border);
      background:
        linear-gradient(135deg,
          var(--gv-navy-900) 0%,
          var(--gv-navy-700) 100%);
      color: oklch(96% 0.005 250);
      position: relative;
      overflow: hidden;
    }
    .card-head::after {
      content: '';
      position: absolute;
      left: 0; right: 0; bottom: 0;
      height: 1px;
      background: linear-gradient(90deg,
        transparent 0%,
        var(--gv-gold) 30%,
        var(--gv-gold-bright) 50%,
        var(--gv-gold) 70%,
        transparent 100%);
    }

    .brand-mark {
      position: relative;
      width: 56px;
      height: 56px;
      border-radius: 14px;
      background: radial-gradient(circle at 30% 30%,
        oklch(86% 0.18 92) 0%,
        oklch(72% 0.18 80) 40%,
        oklch(54% 0.15 70) 100%);
      display: grid;
      place-items: center;
      box-shadow:
        0 1px 2px oklch(0% 0 0 / 0.4),
        inset 0 1px 0 oklch(100% 0 0 / 0.25),
        0 0 0 1px oklch(60% 0.18 80 / 0.4),
        0 0 24px oklch(78% 0.16 85 / 0.4);
      overflow: hidden;
      flex-shrink: 0;
    }
    .brand-glyph {
      font-size: 18px;
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
      animation: shine 3s var(--gv-ease) infinite;
    }
    @keyframes shine {
      0%, 60% { transform: translateX(-100%); }
      100%    { transform: translateX(100%); }
    }

    .brand-text { display: flex; flex-direction: column; gap: 2px; }
    .brand-eyebrow {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.22em;
      color: var(--gv-gold-bright);
    }
    .brand-name {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.015em;
      margin: 0;
      color: oklch(98% 0.005 250);
    }
    .brand-tag {
      font-size: 12px;
      color: oklch(82% 0.012 250);
      margin: 0;
    }

    .card-body {
      padding: var(--gv-space-6);
      display: flex;
      flex-direction: column;
      gap: var(--gv-space-5);
    }
    .welcome {
      font-size: 14px;
      line-height: 1.6;
      color: var(--gv-text-muted);
      margin: 0;
    }

    .login-btn {
      display: inline-flex !important;
      align-items: center;
      justify-content: center;
      gap: var(--gv-space-2);
      width: 100%;
      height: 48px !important;
      font-size: 14px !important;
      font-weight: 600 !important;
    }

    .capabilities {
      list-style: none;
      margin: 0;
      padding: var(--gv-space-2) 0 0;
      display: flex;
      flex-direction: column;
      gap: var(--gv-space-2);
      border-top: 1px solid var(--gv-divider);
      padding-top: var(--gv-space-4);
    }
    .capabilities li {
      display: flex;
      align-items: center;
      gap: var(--gv-space-3);
      font-size: 13px;
      color: var(--gv-text-muted);
    }
    .capabilities mat-icon {
      font-size: 16px !important;
      width: 16px !important;
      height: 16px !important;
      color: var(--gv-gold-deep);
    }

    .card-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--gv-space-3) var(--gv-space-6);
      border-top: 1px solid var(--gv-border);
      background: var(--gv-surface-2);
      font-size: 11px;
      color: var(--gv-text-soft);
    }
    .foot-status { display: inline-flex; align-items: center; gap: var(--gv-space-2); }
    .status-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: var(--gv-success);
      box-shadow: 0 0 6px var(--gv-success);
      animation: gv-pulse-dot 2.4s var(--gv-ease) infinite;
    }
    .foot-version {
      font-family: var(--gv-font-mono);
      color: var(--gv-text-muted);
    }
  `],
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  login(): void {
    this.auth.login();
  }
}
