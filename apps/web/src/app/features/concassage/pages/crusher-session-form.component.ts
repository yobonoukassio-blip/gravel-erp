import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import {
  ConcassageApiService,
  CrusherSession,
} from '../services/concassage-api.service';

/**
 * CrusherSessionFormComponent (CON-01, CON-02).
 *
 * Dual-mode form:
 *   - Open mode (no session id): crusherId, inputZoneId, outputStockpileId, materialType, calibreCode
 *   - Complete mode (session id present): inputTonnageKg, outputTonnageKg, energyKwh, operatingHours
 *
 * Action buttons: Open / Pause / Resume / Complete
 * Completing shows a confirmation before dispatching (stockpile will be updated).
 */
@Component({
  selector: 'gravel-crusher-session-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslocoModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDialogModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="form-container">
      <h2>
        @if (sessionId()) {
          {{ 'concassage.crusher_form.edit_title' | transloco }} — {{ session()?.status }}
        } @else {
          {{ 'concassage.crusher_form.new_title' | transloco }}
        }
      </h2>

      @if (!sessionId()) {
        <!-- OPEN MODE -->
        <form [formGroup]="openForm" (ngSubmit)="onOpen()" class="form-body">
          <mat-form-field appearance="outline">
            <mat-label>{{ 'concassage.crusher_form.crusher_id' | transloco }}</mat-label>
            <input matInput formControlName="crusherId" placeholder="UUID du concasseur" />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>{{ 'concassage.crusher_form.input_zone_id' | transloco }}</mat-label>
            <input matInput formControlName="inputZoneId" placeholder="Zone d'entrée (optionnel)" />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>{{ 'concassage.crusher_form.output_stockpile_id' | transloco }}</mat-label>
            <input matInput formControlName="outputStockpileId" required placeholder="UUID stockpile de sortie" />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>{{ 'concassage.crusher_form.material_type' | transloco }}</mat-label>
            <mat-select formControlName="materialType">
              <mat-option value="granite_brut">Granite brut</mat-option>
              <mat-option value="tout_venant">Tout-venant</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>{{ 'concassage.crusher_form.calibre_code' | transloco }}</mat-label>
            <input matInput formControlName="calibreCode" placeholder="ex: 0-31" required />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>{{ 'concassage.crusher_form.operational_day_id' | transloco }}</mat-label>
            <input matInput formControlName="operationalDayId" placeholder="UUID jour opérationnel" required />
          </mat-form-field>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'concassage.crusher_form.notes' | transloco }}</mat-label>
            <textarea matInput formControlName="notesMd" rows="3"></textarea>
          </mat-form-field>

          <div class="actions">
            <button mat-raised-button color="primary" type="submit" [disabled]="openForm.invalid || saving()">
              {{ 'concassage.crusher_form.open_session' | transloco }}
            </button>
            <button mat-button type="button" (click)="onCancel()">
              {{ 'common.cancel' | transloco }}
            </button>
          </div>
        </form>
      }

      @if (sessionId() && session()) {
        <!-- COMPLETE / MANAGE MODE -->
        <form [formGroup]="completeForm" class="form-body">
          <mat-form-field appearance="outline">
            <mat-label>{{ 'concassage.crusher_form.input_tonnage_kg' | transloco }}</mat-label>
            <input matInput type="number" formControlName="inputTonnageKg" min="0" />
            <mat-hint>kg</mat-hint>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>{{ 'concassage.crusher_form.output_tonnage_kg' | transloco }}</mat-label>
            <input matInput type="number" formControlName="outputTonnageKg" min="0" />
            <mat-hint>kg</mat-hint>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>{{ 'concassage.crusher_form.energy_kwh' | transloco }}</mat-label>
            <input matInput type="number" formControlName="energyKwh" min="0" step="0.01" />
            <mat-hint>kWh (CON-02)</mat-hint>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>{{ 'concassage.crusher_form.operating_hours' | transloco }}</mat-label>
            <input matInput type="number" formControlName="operatingHours" min="0" step="0.01" />
            <mat-hint>heures</mat-hint>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>{{ 'concassage.crusher_form.year_month' | transloco }}</mat-label>
            <input matInput formControlName="yearMonth" placeholder="2026-05" />
          </mat-form-field>

          <div class="actions">
            @if (session()?.status === 'ACTIVE') {
              <button mat-raised-button color="warn" type="button" (click)="onPause()" [disabled]="saving()">
                {{ 'concassage.crusher_form.pause' | transloco }}
              </button>
            }
            @if (session()?.status === 'PAUSED') {
              <button mat-raised-button color="accent" type="button" (click)="onResume()" [disabled]="saving()">
                {{ 'concassage.crusher_form.resume' | transloco }}
              </button>
            }
            @if (session()?.status !== 'COMPLETED') {
              <button
                mat-raised-button color="primary" type="button"
                (click)="onCompleteConfirm()"
                [disabled]="completeForm.invalid || saving()"
              >
                {{ 'concassage.crusher_form.complete' | transloco }}
              </button>
            }
            <button mat-button type="button" (click)="onCancel()">
              {{ 'common.back' | transloco }}
            </button>
          </div>
        </form>
      }
    </div>
  `,
  styles: [
    `.form-container { max-width: 640px; margin: 0 auto; padding: 16px; }`,
    `.form-body { display: flex; flex-direction: column; gap: 12px; }`,
    `.actions { display: flex; gap: 8px; padding-top: 12px; }`,
    `.full-width { width: 100%; }`,
  ],
})
export class CrusherSessionFormComponent implements OnInit {
  private readonly api = inject(ConcassageApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly sessionId = signal<string | null>(null);
  readonly session = signal<CrusherSession | null>(null);
  readonly saving = signal(false);

  readonly openForm = this.fb.group({
    crusherId: ['', Validators.required],
    inputZoneId: [null as string | null],
    outputStockpileId: ['', Validators.required],
    materialType: ['granite_brut', Validators.required],
    calibreCode: ['', Validators.required],
    operationalDayId: ['', Validators.required],
    operatorId: ['op-placeholder'], // Stub: from auth context
    tenantId: [''],                 // Stub: from auth context
    siteId: [''],                   // Stub: from auth context
    notesMd: [null as string | null],
  });

  readonly completeForm = this.fb.group({
    inputTonnageKg: [0, [Validators.required, Validators.min(0)]],
    outputTonnageKg: [0, [Validators.required, Validators.min(0)]],
    energyKwh: [0, [Validators.required, Validators.min(0)]],
    operatingHours: [0, [Validators.required, Validators.min(0)]],
    yearMonth: ['', Validators.required],
    notesMd: [null as string | null],
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.sessionId.set(id);
      // Stub: tenantId from auth context in downstream plans
      this.api.getCrusherSession(id, '').subscribe({
        next: (s) => this.session.set(s),
        error: () => this.snack.open('concassage.errors.load_failed', 'OK', { duration: 4000 }),
      });
    }
  }

  onOpen(): void {
    if (this.openForm.invalid) return;
    this.saving.set(true);
    const v = this.openForm.getRawValue();
    this.api
      .openCrusherSession({
        tenantId: v.tenantId ?? '',
        siteId: v.siteId ?? '',
        operationalDayId: v.operationalDayId ?? '',
        crusherId: v.crusherId ?? '',
        inputZoneId: v.inputZoneId ?? null,
        outputStockpileId: v.outputStockpileId ?? '',
        materialType: v.materialType ?? 'granite_brut',
        calibreCode: v.calibreCode ?? '',
        operatorId: v.operatorId ?? '',
        notesMd: v.notesMd,
      })
      .subscribe({
        next: (s) => {
          this.saving.set(false);
          this.snack.open('concassage.crusher_form.session_opened', 'OK', { duration: 3000 });
          void this.router.navigate(['/concassage', 'crusher', s.id]);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.snack.open('concassage.errors.open_failed', 'OK', { duration: 4000 });
          console.error('Failed to open crusher session', err);
        },
      });
  }

  onPause(): void {
    const id = this.sessionId();
    if (!id) return;
    this.saving.set(true);
    this.api.pauseCrusherSession(id).subscribe({
      next: (s) => {
        this.session.set(s);
        this.saving.set(false);
        this.snack.open('concassage.crusher_form.session_paused', 'OK', { duration: 3000 });
      },
      error: (err: unknown) => {
        this.saving.set(false);
        console.error('Failed to pause crusher session', err);
      },
    });
  }

  onResume(): void {
    const id = this.sessionId();
    if (!id) return;
    this.saving.set(true);
    this.api.resumeCrusherSession(id).subscribe({
      next: (s) => {
        this.session.set(s);
        this.saving.set(false);
        this.snack.open('concassage.crusher_form.session_resumed', 'OK', { duration: 3000 });
      },
      error: (err: unknown) => {
        this.saving.set(false);
        console.error('Failed to resume crusher session', err);
      },
    });
  }

  onCompleteConfirm(): void {
    if (this.completeForm.invalid) return;
    // Confirmation modal before completing (stockpile will be updated).
    const confirmed = window.confirm(
      'Fermer la session ? Les tonnages seront transmis au stockpile.',
    );
    if (confirmed) this.onComplete();
  }

  private onComplete(): void {
    const id = this.sessionId();
    if (!id) return;
    this.saving.set(true);
    const v = this.completeForm.getRawValue();
    this.api
      .completeCrusherSession(id, {
        inputTonnageKg: v.inputTonnageKg ?? 0,
        outputTonnageKg: v.outputTonnageKg ?? 0,
        energyKwh: v.energyKwh ?? 0,
        operatingHours: v.operatingHours ?? 0,
        yearMonth: v.yearMonth ?? '',
        operatorId: 'op-placeholder', // Stub: from auth context
        notesMd: v.notesMd,
      })
      .subscribe({
        next: (s) => {
          this.session.set(s);
          this.saving.set(false);
          this.snack.open('concassage.crusher_form.session_completed', 'OK', { duration: 4000 });
          void this.router.navigate(['/concassage']);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.snack.open('concassage.errors.complete_failed', 'OK', { duration: 4000 });
          console.error('Failed to complete crusher session', err);
        },
      });
  }

  onCancel(): void {
    void this.router.navigate(['/concassage']);
  }
}
