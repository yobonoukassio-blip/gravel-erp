import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoService, TranslocoModule } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * FR ↔ EN locale switcher.
 *
 * Persists the user choice via the CANONICAL endpoint owned by W2-P04:
 *   PUT /api/users/me/preferences { key: 'locale', value: 'fr-CI' | 'en-CI' }
 *
 * This is the ONLY place in the web app that writes a locale preference.
 * Do NOT call '/api/sync/preferences' here — that is W2-P03's sync-replica
 * path, not the canonical source of truth. CDC reconciles the replica.
 */
@Component({
  selector: 'gravel-locale-switcher',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatMenuModule, MatIconModule, TranslocoModule],
  template: `
    <button mat-button type="button" [matMenuTriggerFor]="menu" aria-label="locale">
      <mat-icon>language</mat-icon>
      {{ active().toUpperCase() }}
    </button>
    <mat-menu #menu="matMenu">
      <button mat-menu-item type="button" (click)="set('fr')">
        {{ 'common.locale.fr' | transloco }}
      </button>
      <button mat-menu-item type="button" (click)="set('en')">
        {{ 'common.locale.en' | transloco }}
      </button>
    </mat-menu>
  `,
})
export class LocaleSwitcherComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly http = inject(HttpClient);

  active(): string {
    return this.transloco.getActiveLang();
  }

  async set(lang: 'fr' | 'en'): Promise<void> {
    this.transloco.setActiveLang(lang);
    const value = lang === 'fr' ? 'fr-CI' : 'en-CI';
    await firstValueFrom(
      this.http.put(`${environment.apiBaseUrl}/api/users/me/preferences`, {
        key: 'locale',
        value,
      }),
    );
  }
}
