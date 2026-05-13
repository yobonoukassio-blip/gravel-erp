import { ChangeDetectionStrategy, Component, Input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';

export type GaugeStatus = 'ok' | 'warning' | 'critical';

/**
 * StockpileGaugeComponent — circular-style gauge showing balance vs capacity.
 * Status drives color: green (ok), amber (warning), red (critical).
 * Used for both stockpile levels and fuel tanks (DSH-01).
 */
@Component({
  selector: 'gravel-stockpile-gauge',
  standalone: true,
  imports: [CommonModule, MatCardModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-card class="gauge-card" [class]="'gauge-' + status" [attr.data-testid]="'gauge-' + label">
      <mat-card-header>
        <mat-card-subtitle class="gauge-label">{{ label }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content class="gauge-body">
        <svg viewBox="0 0 36 36" class="gauge-svg" [attr.aria-label]="label + ' ' + pctDisplay + '%'">
          <!-- Background circle -->
          <circle cx="18" cy="18" r="15.9155" class="gauge-bg" />
          <!-- Progress arc -->
          <circle
            cx="18" cy="18" r="15.9155"
            class="gauge-arc"
            [class]="'gauge-arc-' + status"
            [attr.stroke-dasharray]="dashArray"
            stroke-dashoffset="25"
          />
        </svg>
        <span class="gauge-pct">{{ pctDisplay }}%</span>
        <span class="gauge-sub">{{ valueDisplay }}</span>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .gauge-card { min-width: 130px; text-align: center; padding: 8px; }
    .gauge-label { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
    .gauge-body  { position: relative; display: flex; flex-direction: column; align-items: center; }
    .gauge-svg   { width: 80px; height: 80px; transform: rotate(-90deg); }
    .gauge-bg    { fill: none; stroke: #e5e7eb; stroke-width: 3; }
    .gauge-arc   { fill: none; stroke-width: 3; stroke-linecap: round; transition: stroke-dasharray .4s ease; }
    .gauge-arc-ok       { stroke: #16a34a; }
    .gauge-arc-warning  { stroke: #d97706; }
    .gauge-arc-critical { stroke: #dc2626; }
    .gauge-pct  { position: absolute; top: 28px; font-size: 18px; font-weight: 700; }
    .gauge-sub  { font-size: 11px; color: rgba(0,0,0,.54); margin-top: 4px; }
  `],
})
export class StockpileGaugeComponent {
  @Input() label = '';
  @Input() balanceValue = 0;
  @Input() balanceUnit = 'kg';
  @Input() pct = 0;
  @Input() status: GaugeStatus = 'ok';

  get dashArray(): string {
    const clamped = Math.min(100, Math.max(0, this.pct));
    return `${clamped} ${100 - clamped}`;
  }

  get pctDisplay(): number {
    return Math.round(this.pct);
  }

  get valueDisplay(): string {
    if (this.balanceUnit === 'kg') {
      if (this.balanceValue >= 1_000_000) {
        return `${(this.balanceValue / 1_000_000).toFixed(1)} kt`;
      }
      return `${(this.balanceValue / 1_000).toFixed(1)} t`;
    }
    return `${this.balanceValue.toFixed(0)} ${this.balanceUnit}`;
  }
}
