import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HttpClient } from '@angular/common/http';

/**
 * FuelDeliveriesComponent (CAR-01) — record a FUEL_DELIVERY_IN event.
 *
 * Form fields:
 *   - tank_id (dropdown)
 *   - supplier_bl_number → stored as source_reference.supplier_bl_sha256
 *   - liters_delta (positive)
 *   - cost_per_liter_minor_units (XOF)
 *   - currency (default XOF)
 *   - photo upload
 */
@Component({
  selector: 'gravel-fuel-deliveries',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    TranslocoModule, MatButtonModule, MatInputModule,
    MatFormFieldModule, MatSelectModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>{{ 'fuel.deliveries.title' | transloco }}</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" class="delivery-form">
      <mat-form-field appearance="outline">
        <mat-label>{{ 'fuel.deliveries.tank' | transloco }}</mat-label>
        <input matInput formControlName="tank_id" placeholder="UUID cuve" required />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>{{ 'fuel.deliveries.bl_number' | transloco }}</mat-label>
        <input matInput formControlName="supplier_bl_number" required />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>{{ 'fuel.deliveries.liters' | transloco }}</mat-label>
        <input matInput type="number" formControlName="liters_delta" min="1" required />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>{{ 'fuel.deliveries.cost_per_liter' | transloco }} (XOF)</mat-label>
        <input matInput type="number" formControlName="cost_per_liter" min="0" />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>{{ 'fuel.deliveries.currency' | transloco }}</mat-label>
        <mat-select formControlName="currency">
          <mat-option value="XOF">XOF</mat-option>
          <mat-option value="EUR">EUR</mat-option>
          <mat-option value="USD">USD</mat-option>
        </mat-select>
      </mat-form-field>

      <button
        mat-flat-button
        color="primary"
        type="submit"
        [disabled]="form.invalid || submitting()"
      >
        {{ 'fuel.deliveries.submit' | transloco }}
      </button>

      @if (lastError()) {
        <p class="error">{{ lastError() }}</p>
      }
    </form>
  `,
  styles: [`.delivery-form { display: flex; flex-direction: column; gap: 12px; max-width: 480px; }`],
})
export class FuelDeliveriesComponent {
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  readonly submitting = signal(false);
  readonly lastError = signal<string | null>(null);

  readonly form = this.fb.group({
    tank_id: ['', Validators.required],
    supplier_bl_number: ['', Validators.required],
    liters_delta: [null as number | null, [Validators.required, Validators.min(1)]],
    cost_per_liter: [null as number | null],
    currency: ['XOF'],
    operational_day_id: [''], // bound from shell context in real app
  });

  submit(): void {
    if (this.form.invalid) return;
    this.submitting.set(true);
    this.lastError.set(null);

    const v = this.form.value;
    const payload = {
      tank_id: v.tank_id,
      site_id: 'current-site', // TODO: bind from auth context
      event_type: 'FUEL_DELIVERY_IN',
      liters_delta: v.liters_delta,
      operational_day_id: v.operational_day_id || 'current',
      source_reference: { supplier_bl_sha256: v.supplier_bl_number },
      occurred_at_utc: new Date().toISOString(),
      cost_per_liter_minor_units: v.cost_per_liter,
      currency: v.currency,
    };

    this.http.post('/api/fuel-tank-events', payload).subscribe({
      next: () => {
        this.snack.open('Livraison enregistrée', 'OK', { duration: 3000 });
        this.form.reset({ currency: 'XOF' });
        this.submitting.set(false);
      },
      error: (err: Error) => {
        this.lastError.set(err.message);
        this.submitting.set(false);
      },
    });
  }
}
