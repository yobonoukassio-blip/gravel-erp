import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
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
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    TranslocoModule,
    LocaleSwitcherComponent,
  ],
  template: `
    <mat-toolbar color="primary">
      <span class="brand">{{ 'app.name' | transloco }}</span>
      <span class="spacer"></span>
      <ng-container *ngIf="claims$ | async as claims">
        <span class="meta">
          {{ claims.role }} · {{ claims.siteIds.length }}
          {{ 'header.sites' | transloco }}
        </span>
      </ng-container>
      <gravel-locale-switcher />
      <button
        mat-icon-button
        type="button"
        (click)="logout()"
        [attr.aria-label]="'header.logout' | transloco"
      >
        <mat-icon>logout</mat-icon>
      </button>
    </mat-toolbar>
  `,
  styles: [
    `
      .brand {
        font-weight: 600;
      }
      .spacer {
        flex: 1 1 auto;
      }
      .meta {
        margin-right: 1rem;
        font-size: 0.9rem;
        opacity: 0.85;
      }
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
