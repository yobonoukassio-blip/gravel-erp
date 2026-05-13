import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { StockpileApiService } from '../services/stockpile-api.service';

interface AdjustmentForm {
  stockpile_id: string;
  calibre_code: string;
  operational_day_id: string;
  tonnage_delta_kg: number;
  reason: string;
  photo_sha256: string;
}

/**
 * STK-01 — Manual adjustment entry (STOCKPILE_ADJUSTMENT event).
 *
 * Used by SITE_MANAGER to correct physical inventory discrepancies.
 * Server enforces:
 *   - SITE_MANAGER role (D2-111)
 *   - source_reference.reason (non-empty string)
 *   - source_reference.photo_sha256 (hex digest of supporting photo)
 *
 * The form forbids submit until both `reason` and `photo` (with computed
 * SHA-256) are present.
 */
@Component({
  selector: 'gravel-stockpile-adjustment',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslocoModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>{{ 'stockpile.adjustment.title' | transloco }}</h2>
    <p class="role-hint">{{ 'stockpile.adjustment_role_required' | transloco }}</p>
    <form (ngSubmit)="submit()" #f="ngForm">
      <mat-form-field appearance="outline">
        <mat-label>{{ 'stockpile.adjustment.stockpile_id' | transloco }}</mat-label>
        <input matInput [(ngModel)]="form.stockpile_id" name="stockpile_id" required />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>{{ 'stockpile.adjustment.calibre' | transloco }}</mat-label>
        <input matInput [(ngModel)]="form.calibre_code" name="calibre_code" required />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>{{ 'stockpile.adjustment.delta_kg' | transloco }}</mat-label>
        <input
          matInput
          type="number"
          [(ngModel)]="form.tonnage_delta_kg"
          name="tonnage_delta_kg"
          required
        />
      </mat-form-field>
      <mat-form-field appearance="outline" style="width:100%">
        <mat-label>{{ 'stockpile.adjustment.reason' | transloco }}</mat-label>
        <textarea
          matInput
          [(ngModel)]="form.reason"
          name="reason"
          rows="3"
          required
          minlength="3"
        ></textarea>
      </mat-form-field>
      <div class="photo-row">
        <label for="photo-upload" class="photo-label">
          {{ 'stockpile.adjustment.photo' | transloco }} (required)
        </label>
        <input
          id="photo-upload"
          type="file"
          accept="image/*"
          name="photo"
          required
          (change)="onPhotoSelected($event)"
        />
        <span *ngIf="form.photo_sha256" class="photo-hash">
          sha256: {{ form.photo_sha256.substring(0, 16) }}…
        </span>
      </div>
      <button
        mat-raised-button
        color="primary"
        type="submit"
        [disabled]="submitting() || !canSubmit(f.valid)"
      >
        {{ 'stockpile.adjustment.submit' | transloco }}
      </button>
    </form>
  `,
  styles: [
    `
      form {
        display: flex;
        flex-direction: column;
        gap: 16px;
        max-width: 480px;
      }
      .role-hint {
        color: #ed6c02;
        font-size: 0.875rem;
      }
      .photo-row {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .photo-hash {
        font-family: monospace;
        font-size: 0.75rem;
        color: #555;
      }
    `,
  ],
})
export class StockpileAdjustmentComponent implements OnInit {
  private readonly api = inject(StockpileApiService);
  private readonly snack = inject(MatSnackBar);

  readonly submitting = signal(false);

  form: AdjustmentForm = {
    stockpile_id: '',
    calibre_code: '',
    operational_day_id: 'current',
    tonnage_delta_kg: 0,
    reason: '',
    photo_sha256: '',
  };

  ngOnInit(): void {}

  /** Submit-enabled only when reason has content AND a photo SHA-256 is computed. */
  canSubmit(formValid: boolean | null): boolean {
    return (
      !!formValid &&
      this.form.reason.trim().length >= 3 &&
      /^[0-9a-f]{64}$/i.test(this.form.photo_sha256)
    );
  }

  async onPhotoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      this.form.photo_sha256 = '';
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', buf);
      this.form.photo_sha256 = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Hash computation failed';
      this.snack.open(`Error: ${msg}`, 'OK', { duration: 5000 });
      this.form.photo_sha256 = '';
    }
  }

  submit(): void {
    if (!this.canSubmit(true)) {
      this.snack.open(
        'Reason (≥3 chars) and photo with SHA-256 are required',
        'OK',
        { duration: 5000 },
      );
      return;
    }
    this.submitting.set(true);
    this.api
      .appendAdjustment({
        site_id: 'current',
        stockpile_id: this.form.stockpile_id,
        calibre_code: this.form.calibre_code,
        operational_day_id: this.form.operational_day_id,
        tonnage_delta_kg: this.form.tonnage_delta_kg,
        occurred_at_utc: new Date().toISOString(),
        reason: this.form.reason,
        photo_sha256: this.form.photo_sha256,
      })
      .subscribe({
        next: () => {
          this.snack.open('Adjustment recorded', 'OK', { duration: 3000 });
          this.submitting.set(false);
        },
        error: (err: Error) => {
          this.snack.open(`Error: ${err.message}`, 'OK', { duration: 5000 });
          this.submitting.set(false);
        },
      });
  }
}
