import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef } from 'ag-grid-community';
import { HttpClient } from '@angular/common/http';

export type EnergyUsageType = 'concassage' | 'criblage' | 'ateliers' | 'bureaux';

export const ENERGY_USAGE_TYPES: EnergyUsageType[] = [
  'concassage',
  'criblage',
  'ateliers',
  'bureaux',
];

export interface EnergyReadingRow {
  id: string;
  year_month: string;
  usage_type: EnergyUsageType;
  kwh: number;
  source_meter_code: string | null;
  recorded_at_utc: string;
}

/**
 * EnergyReadingsComponent (CAR-04) — monthly electricity reading entry + display.
 *
 * Formly-style form for 4 usage types (concassage, criblage, ateliers, bureaux).
 * AG-Grid table shows all readings per (year_month).
 */
@Component({
  selector: 'gravel-energy-readings',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    TranslocoModule, MatButtonModule, MatInputModule,
    MatFormFieldModule, MatSelectModule, AgGridAngular,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>{{ 'fuel.energy.title' | transloco }}</h2>

    <form [formGroup]="form" (ngSubmit)="submit()" class="energy-form">
      <mat-form-field appearance="outline">
        <mat-label>{{ 'fuel.energy.year_month' | transloco }}</mat-label>
        <input matInput formControlName="year_month" placeholder="2026-05" required />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>{{ 'fuel.energy.usage_type' | transloco }}</mat-label>
        <mat-select formControlName="usage_type" required>
          @for (t of usageTypes; track t) {
            <mat-option [value]="t">{{ 'fuel.energy.usage.' + t | transloco }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>{{ 'fuel.energy.kwh' | transloco }}</mat-label>
        <input matInput type="number" formControlName="kwh" min="0" step="0.01" required />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>{{ 'fuel.energy.meter_code' | transloco }}</mat-label>
        <input matInput formControlName="source_meter_code" />
      </mat-form-field>

      <button
        mat-flat-button
        color="primary"
        type="submit"
        [disabled]="form.invalid || submitting()"
      >
        {{ 'fuel.energy.save' | transloco }}
      </button>
    </form>

    <ag-grid-angular
      class="ag-theme-material"
      style="height: 360px; margin-top: 24px;"
      [rowData]="rows()"
      [columnDefs]="columnDefs"
      [pagination]="true"
      [paginationPageSize]="20"
    />
  `,
  styles: [`.energy-form { display: flex; flex-direction: column; gap: 12px; max-width: 480px; }`],
})
export class EnergyReadingsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  readonly submitting = signal(false);
  readonly rows = signal<EnergyReadingRow[]>([]);
  readonly usageTypes = ENERGY_USAGE_TYPES;

  readonly form: FormGroup = this.fb.group({
    year_month: ['', [Validators.required, Validators.pattern(/^\d{4}-\d{2}$/)]],
    usage_type: [null as EnergyUsageType | null, Validators.required],
    kwh: [null as number | null, [Validators.required, Validators.min(0)]],
    source_meter_code: [null as string | null],
  });

  readonly columnDefs: ColDef[] = [
    { field: 'yearMonth', headerName: 'Mois', width: 110 },
    { field: 'usageType', headerName: 'Usage', width: 130 },
    {
      field: 'kwh',
      headerName: 'kWh',
      width: 120,
      valueFormatter: (p) => `${(p.value as number).toLocaleString('fr-FR')} kWh`,
    },
    { field: 'sourceMeterCode', headerName: 'Compteur', width: 140 },
    {
      field: 'recordedAtUtc',
      headerName: 'Saisi le',
      width: 160,
      valueFormatter: (p) => new Date(p.value as string).toLocaleDateString('fr-FR'),
    },
  ];

  ngOnInit(): void {
    // Load current month readings on init
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    this.loadReadings(yearMonth);
  }

  submit(): void {
    if (this.form.invalid) return;
    this.submitting.set(true);

    const v = this.form.value as { year_month: string; usage_type: EnergyUsageType; kwh: number; source_meter_code: string | null };
    const payload = {
      site_id: 'current-site', // TODO: bind from auth context
      year_month: v.year_month,
      usage_type: v.usage_type,
      kwh: v.kwh,
      source_meter_code: v.source_meter_code,
    };

    this.http.post('/api/energy-readings', payload).subscribe({
      next: () => {
        this.snack.open('Lecture enregistrée', 'OK', { duration: 3000 });
        this.loadReadings(v.year_month);
        this.submitting.set(false);
      },
      error: (err: Error) => {
        this.snack.open(`Erreur: ${err.message}`, 'OK', { duration: 5000 });
        this.submitting.set(false);
      },
    });
  }

  private loadReadings(yearMonth: string): void {
    this.http
      .get<EnergyReadingRow[]>(`/api/energy-readings?year_month=${yearMonth}`)
      .subscribe({
        next: (rs) => this.rows.set(rs),
        error: (err: Error) =>
          this.snack.open(`Erreur: ${err.message}`, 'OK', { duration: 5000 }),
      });
  }
}
