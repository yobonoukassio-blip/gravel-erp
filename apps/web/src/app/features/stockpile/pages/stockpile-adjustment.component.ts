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
}

/**
 * STK-01 — Manual adjustment entry (STOCKPILE_ADJUSTMENT event).
 * Used by site manager to correct physical inventory discrepancies.
 */
@Component({
  selector: 'gravel-stockpile-adjustment',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>{{ 'stockpile.adjustment.title' | transloco }}</h2>
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
        <input matInput type="number" [(ngModel)]="form.tonnage_delta_kg" name="tonnage_delta_kg" required />
      </mat-form-field>
      <mat-form-field appearance="outline" style="width:100%">
        <mat-label>{{ 'stockpile.adjustment.reason' | transloco }}</mat-label>
        <textarea matInput [(ngModel)]="form.reason" name="reason" rows="3" required></textarea>
      </mat-form-field>
      <button mat-raised-button color="primary" type="submit" [disabled]="submitting() || !f.valid">
        {{ 'stockpile.adjustment.submit' | transloco }}
      </button>
    </form>
  `,
  styles: [`form { display: flex; flex-direction: column; gap: 16px; max-width: 480px; }`],
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
  };

  ngOnInit(): void {}

  submit(): void {
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
