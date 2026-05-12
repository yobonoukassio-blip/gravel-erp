import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { TranslocoModule } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'gravel-login',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatCardModule, TranslocoModule],
  template: `
    <div class="login-shell">
      <mat-card>
        <mat-card-title>{{ 'app.name' | transloco }}</mat-card-title>
        <mat-card-content>
          <p>{{ 'login.subtitle' | transloco }}</p>
          <button mat-raised-button color="primary" type="button" (click)="login()">
            {{ 'login.button' | transloco }}
          </button>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [
    `
      .login-shell {
        display: grid;
        place-items: center;
        min-height: 100vh;
        background: linear-gradient(180deg, #0b1d33 0%, #14315c 100%);
      }
      mat-card {
        max-width: 420px;
        padding: 2rem;
      }
    `,
  ],
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  login(): void {
    this.auth.login();
  }
}
