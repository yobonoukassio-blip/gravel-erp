import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';

/**
 * KpiTileComponent — generic KPI tile with label + value + optional unit.
 * Used across site director and quarry chief dashboards (DSH-01).
 */
@Component({
  selector: 'gravel-kpi-tile',
  standalone: true,
  imports: [CommonModule, MatCardModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-card class="kpi-tile" [attr.data-testid]="testId"
      [class.kpi-warn]="highlight === 'warn'"
      [class.kpi-ok]="highlight === 'ok'">
      <mat-card-header>
        <mat-card-subtitle class="kpi-label">{{ label }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <span class="kpi-value">{{ value }}</span>
        <span *ngIf="unit" class="kpi-unit"> {{ unit }}</span>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .kpi-tile { min-width: 160px; text-align: center; }
    .kpi-label { font-size: 12px; color: rgba(0,0,0,.54); text-transform: uppercase; letter-spacing: .05em; }
    .kpi-value { font-size: 32px; font-weight: 700; line-height: 1; }
    .kpi-unit  { font-size: 14px; color: rgba(0,0,0,.6); }
    .kpi-warn .kpi-value { color: #e65100; }
    .kpi-ok   .kpi-value { color: #2e7d32; }
  `],
})
export class KpiTileComponent {
  @Input() label = '';
  @Input() value: string | number = '—';
  @Input() unit = '';
  @Input() testId = '';
  @Input() highlight: 'warn' | 'ok' | '' = '';
}
