import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'gravel-login',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
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

        <form class="card-body" (submit)="onSubmit($event)" autocomplete="on">
          <p class="welcome">Connectez-vous à votre espace.</p>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Email</mat-label>
            <input
              matInput
              type="email"
              name="email"
              autocomplete="username"
              [(ngModel)]="email"
              required
              data-testid="login-email"
            />
            <mat-icon matSuffix>mail_outline</mat-icon>
          </mat-form-field>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Mot de passe</mat-label>
            <input
              matInput
              [type]="showPassword() ? 'text' : 'password'"
              name="password"
              autocomplete="current-password"
              [(ngModel)]="password"
              required
              data-testid="login-password"
            />
            <button
              type="button"
              mat-icon-button
              matSuffix
              (click)="showPassword.set(!showPassword())"
              [attr.aria-label]="showPassword() ? 'Cacher' : 'Afficher'"
              tabindex="-1"
            >
              <mat-icon>{{ showPassword() ? 'visibility_off' : 'visibility' }}</mat-icon>
            </button>
          </mat-form-field>

          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }

          <button
            mat-flat-button
            color="primary"
            type="submit"
            [disabled]="loading()"
            class="login-btn"
            data-testid="login-button"
          >
            @if (loading()) {
              <mat-spinner diameter="20"></mat-spinner>
              <span>Connexion…</span>
            } @else {
              <mat-icon>login</mat-icon>
              <span>Se connecter</span>
            }
          </button>

          <details class="demo-creds">
            <summary>Comptes de démo</summary>
            <ul>
              <li><code>admin&#64;gravel-ivoire.ci</code> · Direction Groupe</li>
              <li><code>directeur.mobaye&#64;gravel-ivoire.ci</code> · Directeur Site</li>
              <li><code>chef.carriere&#64;gravel-ivoire.ci</code> · Chef Carrière</li>
              <li class="pwd">Mot de passe : <code>Gravel2026!</code></li>
            </ul>
          </details>
        </form>

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
      padding: 24px;
      background:
        linear-gradient(180deg,
          #0a1628 0%,
          #102542 50%,
          #0a1628 100%);
      overflow: hidden;
    }

    .bg-grid {
      position: absolute; inset: 0;
      background-image:
        linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px);
      background-size: 56px 56px;
      mask-image: radial-gradient(ellipse at center, #000 0%, transparent 75%);
      pointer-events: none;
    }
    .bg-glow { position: absolute; border-radius: 50%; filter: blur(120px); pointer-events: none; opacity: 0.5; }
    .bg-glow-tl { top: -180px; left: -120px; width: 440px; height: 440px;
      background: radial-gradient(circle, #e0b54a 0%, transparent 70%); }
    .bg-glow-br { bottom: -180px; right: -120px; width: 440px; height: 440px;
      background: radial-gradient(circle, #2c5aa0 0%, transparent 70%); }

    .card {
      position: relative; z-index: 1; width: 100%; max-width: 440px;
      background: #ffffff;
      border-radius: 14px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.3), 0 24px 60px rgba(0,0,0,0.35);
      overflow: hidden;
    }

    .card-head {
      display: flex; align-items: center; gap: 16px;
      padding: 24px 24px 20px;
      background: linear-gradient(135deg, #0a1628 0%, #1e3a5f 100%);
      color: #f5f7fa;
      position: relative; overflow: hidden;
    }
    .card-head::after {
      content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 1px;
      background: linear-gradient(90deg, transparent 0%, #e0b54a 50%, transparent 100%);
    }

    .brand-mark {
      position: relative; width: 56px; height: 56px; border-radius: 14px;
      background: radial-gradient(circle at 30% 30%, #f0c75e 0%, #c8a040 40%, #886820 100%);
      display: grid; place-items: center;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.25), 0 0 24px rgba(224,181,74,0.4);
      overflow: hidden; flex-shrink: 0;
    }
    .brand-glyph { font-size: 18px; font-weight: 800; letter-spacing: 0.06em; color: #3a2a08; z-index: 1; }
    .brand-spark {
      position: absolute; inset: -50%;
      background: linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%);
      transform: translateX(-100%); animation: shine 3s ease infinite;
    }
    @keyframes shine { 0%, 60% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }

    .brand-text { display: flex; flex-direction: column; gap: 2px; }
    .brand-eyebrow { font-size: 10px; font-weight: 700; letter-spacing: 0.22em; color: #f0c75e; }
    .brand-name { font-size: 22px; font-weight: 700; letter-spacing: -0.015em; margin: 0; color: #f5f7fa; }
    .brand-tag { font-size: 12px; color: #b8c4d4; margin: 0; }

    .card-body {
      padding: 24px;
      display: flex; flex-direction: column; gap: 14px;
    }
    .welcome { font-size: 14px; color: #5a6373; margin: 0 0 4px; }
    .full-width { width: 100%; }

    .error {
      margin: 0; padding: 10px 12px;
      background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px;
      color: #b91c1c; font-size: 13px;
    }

    .login-btn {
      display: inline-flex !important;
      align-items: center; justify-content: center;
      gap: 8px;
      width: 100%; height: 48px !important;
      font-size: 14px !important; font-weight: 600 !important;
    }
    .login-btn mat-spinner { display: inline-block; }

    .demo-creds {
      margin-top: 8px;
      font-size: 12px;
      color: #5a6373;
    }
    .demo-creds summary {
      cursor: pointer; color: #2c5aa0; user-select: none;
      padding: 4px 0;
    }
    .demo-creds ul {
      list-style: none; margin: 8px 0 0; padding: 12px;
      background: #f7f9fc; border-radius: 6px; border: 1px solid #e2e8f0;
    }
    .demo-creds li { padding: 3px 0; }
    .demo-creds li.pwd { margin-top: 6px; padding-top: 8px; border-top: 1px dashed #cbd5e0; }
    .demo-creds code {
      background: #ffffff; padding: 1px 6px; border-radius: 4px;
      font-family: ui-monospace, monospace; font-size: 11px;
      border: 1px solid #e2e8f0;
    }

    .card-foot {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 24px;
      border-top: 1px solid #e2e8f0;
      background: #f7f9fc;
      font-size: 11px; color: #5a6373;
    }
    .foot-status { display: inline-flex; align-items: center; gap: 8px; }
    .status-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: #10b981; box-shadow: 0 0 6px #10b981;
      animation: pulse 2.4s ease infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
    .foot-version { font-family: ui-monospace, monospace; color: #94a3b8; }
  `],
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  email = '';
  password = '';
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly showPassword = signal(false);

  async onSubmit(evt: Event): Promise<void> {
    evt.preventDefault();
    if (this.loading()) return;
    this.error.set(null);

    const email = (this.email ?? '').trim();
    const password = this.password ?? '';
    if (!email || !password) {
      this.error.set('Email et mot de passe requis.');
      return;
    }

    this.loading.set(true);
    try {
      await this.auth.loginWithPassword(email, password);
      await this.router.navigateByUrl('/');
    } catch (err: unknown) {
      const e = err as { status?: number; error?: { code?: string } };
      if (e.status === 401) {
        this.error.set('Identifiants invalides.');
      } else if (e.status === 0) {
        this.error.set('Serveur injoignable. Réessayez dans un instant.');
      } else {
        this.error.set('Erreur de connexion. Réessayez.');
      }
    } finally {
      this.loading.set(false);
    }
  }
}
