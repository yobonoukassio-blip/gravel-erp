import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FinanceApiService } from '../services/finance-api.service';

type OhadaTarget = 'sage' | 'ciel' | 'odoo';

/** FIN-05 — Trigger OHADA export and download CSV. */
@Component({
  selector: 'gravel-ohada-export',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslocoModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>{{ 'finance.ohada.title' | transloco }}</h2>
    <p>OHADA discipline: ERP exports analytical accounting only — general accounting stays in your accountant's tool.</p>
    <form (ngSubmit)="exportNow()" #f="ngForm" class="form">
      <mat-form-field appearance="outline">
        <mat-label>{{ 'finance.ohada.site' | transloco }}</mat-label>
        <input matInput [(ngModel)]="siteId" name="siteId" required />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>{{ 'finance.ohada.from' | transloco }}</mat-label>
        <input matInput type="date" [(ngModel)]="from" name="from" required />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>{{ 'finance.ohada.to' | transloco }}</mat-label>
        <input matInput type="date" [(ngModel)]="to" name="to" required />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>{{ 'finance.ohada.target' | transloco }}</mat-label>
        <mat-select [(ngModel)]="target" name="target" required>
          <mat-option value="sage">Sage 100 OHADA</mat-option>
          <mat-option value="ciel">Ciel</mat-option>
          <mat-option value="odoo">Odoo</mat-option>
        </mat-select>
      </mat-form-field>
      <button mat-raised-button color="primary" type="submit" [disabled]="loading() || !f.valid">
        {{ 'finance.ohada.download' | transloco }}
      </button>
    </form>
  `,
  styles: [
    `
      .form {
        display: flex;
        flex-direction: column;
        gap: 16px;
        max-width: 480px;
      }
    `,
  ],
})
export class OhadaExportComponent {
  private readonly api = inject(FinanceApiService);
  private readonly snack = inject(MatSnackBar);

  readonly loading = signal(false);

  siteId = 'current';
  from = '';
  to = '';
  target: OhadaTarget = 'sage';

  exportNow(): void {
    this.loading.set(true);
    this.api.ohadaExport(this.siteId, this.from, this.to, this.target).subscribe({
      next: ({ csv }) => {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ohada-${this.target}-${this.from}-${this.to}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.snack.open(`Error: ${err.message}`, 'OK', { duration: 5000 });
        this.loading.set(false);
      },
    });
  }
}
