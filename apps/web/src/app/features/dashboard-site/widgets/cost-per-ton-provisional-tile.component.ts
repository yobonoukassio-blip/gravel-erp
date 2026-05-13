import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { MatCardModule } from '@angular/material/card';

/**
 * CostPerTonProvisionalTileComponent (D2-100, DSH-01).
 *
 * MANDATORY: This tile MUST always display the "Provisoire" label.
 * Background is amber to draw visual attention.
 * i18n key: dashboard.cost_per_ton_provisional_label
 *  = "Provisoire (carburant uniquement — coût final Phase 4)"
 *
 * Never display the raw number without this label — CLAUDE.md hard constraint.
 */
@Component({
  selector: 'gravel-cost-per-ton-provisional-tile',
  standalone: true,
  imports: [CommonModule, TranslocoModule, MatCardModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-card class="provisional-tile" data-testid="cost-per-ton-provisional-tile">
      <mat-card-header>
        <mat-card-subtitle class="provisional-label" data-testid="provisional-label">
          <!-- Provisoire label mandatory per D2-100 -->
          {{ 'dashboard.cost_per_ton_provisional_label' | transloco }}
        </mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <ng-container *ngIf="value !== null; else noData">
          <span class="cost-value" data-testid="cost-value">
            {{ value | number:'1.0-0' }} {{ currency }}
          </span>
          <span class="cost-unit">/t</span>
        </ng-container>
        <ng-template #noData>
          <span class="cost-value">—</span>
        </ng-template>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .provisional-tile {
      background-color: #FFF3CD;
      border-left: 4px solid #F59E0B;
      min-width: 200px;
    }
    .provisional-label {
      font-size: 11px;
      color: #92400E;
      text-transform: uppercase;
      letter-spacing: .04em;
      font-weight: 600;
    }
    .cost-value {
      font-size: 28px;
      font-weight: 700;
      color: #78350F;
    }
    .cost-unit {
      font-size: 13px;
      color: #92400E;
    }
  `],
})
export class CostPerTonProvisionalTileComponent {
  /** Cost in minor units (e.g., XOF). Null = not yet computed. */
  @Input() value: number | null = null;
  @Input() currency = 'XOF';
}
