import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'gravel-not-found',
  standalone: true,
  imports: [CommonModule, RouterLink, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="not-found">
      <div class="card">
        <div class="card-glow" aria-hidden="true"></div>
        <span class="status gv-num">404</span>
        <h1 class="title">Page introuvable</h1>
        <p class="sub">
          La ressource demandée n'existe pas ou a été déplacée.
        </p>
        <div class="actions">
          <a
            mat-flat-button
            color="primary"
            routerLink="/dashboard"
            class="primary-action"
          >
            <mat-icon>dashboard</mat-icon>
            Retour au tableau de bord
          </a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .not-found {
      min-height: 70vh;
      display: grid;
      place-items: center;
      padding: var(--gv-space-8);
    }

    .card {
      position: relative;
      max-width: 480px;
      width: 100%;
      padding: var(--gv-space-10) var(--gv-space-8);
      background: linear-gradient(180deg,
        var(--gv-surface) 0%,
        var(--gv-surface-2) 100%);
      border: 1px solid var(--gv-border);
      border-radius: var(--gv-radius-lg);
      box-shadow: var(--gv-shadow-3);
      text-align: center;
      overflow: hidden;
      animation: gv-fade-up var(--gv-duration-4) var(--gv-ease) both;
    }
    .card-glow {
      position: absolute;
      top: -120px;
      left: 50%;
      transform: translateX(-50%);
      width: 360px;
      height: 360px;
      background: radial-gradient(circle,
        oklch(78% 0.16 85 / 0.3) 0%, transparent 60%);
      pointer-events: none;
    }

    .status {
      position: relative;
      display: block;
      font-size: 96px;
      font-weight: 700;
      line-height: 1;
      letter-spacing: -0.04em;
      background: linear-gradient(180deg, var(--gv-navy-700), var(--gv-navy-900));
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: var(--gv-space-2);
    }
    .title {
      position: relative;
      font-size: 22px;
      font-weight: 600;
      letter-spacing: -0.015em;
      margin: 0 0 var(--gv-space-2);
      color: var(--gv-text);
    }
    .sub {
      position: relative;
      font-size: 14px;
      color: var(--gv-text-muted);
      margin: 0 0 var(--gv-space-6);
      line-height: 1.5;
    }
    .actions {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: var(--gv-space-3);
    }
    .primary-action {
      display: inline-flex !important;
      align-items: center;
      gap: var(--gv-space-2);
    }
  `],
})
export class NotFoundComponent {}
