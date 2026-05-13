import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  CalibreYield,
  ConcassageApiService,
  ScreeningSession,
} from '../services/concassage-api.service';

/**
 * ScreeningSessionFormComponent (CRI-01).
 *
 * Dual-mode:
 *   - Open mode: screenId, inputStockpileId, operationalDayId
 *   - Complete mode: inputTonnageKg + dynamic calibreYields FormArray
 *     Each calibre row: calibre_code, output_stockpile_id, tonnage_kg,
 *     is_nonconforming toggle, nonconformity_reason (required when is_nonconforming=true)
 *
 * FormArray is dynamic — "Add Calibre" appends a new row.
 * Minimum 1 calibre required for completion.
 * Formly-style conditional: nonconformity_reason shows/validates only when is_nonconforming=true.
 */
@Component({
  selector: 'gravel-screening-session-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslocoModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="form-container">
      <h2>
        @if (sessionId()) {
          {{ 'criblage.screening_form.edit_title' | transloco }} — {{ session()?.status }}
        } @else {
          {{ 'criblage.screening_form.new_title' | transloco }}
        }
      </h2>

      @if (!sessionId()) {
        <!-- OPEN MODE -->
        <form [formGroup]="openForm" (ngSubmit)="onOpen()" class="form-body">
          <mat-form-field appearance="outline">
            <mat-label>{{ 'criblage.screening_form.screen_id' | transloco }}</mat-label>
            <input matInput formControlName="screenId" placeholder="UUID du crible" required />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>{{ 'criblage.screening_form.input_stockpile_id' | transloco }}</mat-label>
            <input matInput formControlName="inputStockpileId" placeholder="UUID stockpile d'entrée (optionnel)" />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>{{ 'criblage.screening_form.operational_day_id' | transloco }}</mat-label>
            <input matInput formControlName="operationalDayId" placeholder="UUID jour opérationnel" required />
          </mat-form-field>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'criblage.screening_form.notes' | transloco }}</mat-label>
            <textarea matInput formControlName="notesMd" rows="3"></textarea>
          </mat-form-field>

          <div class="actions">
            <button mat-raised-button color="primary" type="submit" [disabled]="openForm.invalid || saving()">
              {{ 'criblage.screening_form.open_session' | transloco }}
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
            <mat-label>{{ 'criblage.screening_form.input_tonnage_kg' | transloco }}</mat-label>
            <input matInput type="number" formControlName="inputTonnageKg" min="0" />
            <mat-hint>kg</mat-hint>
          </mat-form-field>

          <!-- Dynamic calibre_yields FormArray -->
          <div class="calibre-section">
            <h3>{{ 'criblage.screening_form.calibre_yields' | transloco }}</h3>

            <div formArrayName="calibreYields" class="calibre-list">
              @for (yield of calibreYieldsArray.controls; track $index; let i = $index) {
                <div [formGroupName]="i" class="calibre-row">
                  <h4>{{ 'criblage.screening_form.calibre' | transloco }} {{ i + 1 }}</h4>

                  <mat-form-field appearance="outline">
                    <mat-label>{{ 'criblage.screening_form.calibre_code' | transloco }}</mat-label>
                    <input matInput formControlName="calibre_code" placeholder="ex: 0-4" required />
                  </mat-form-field>

                  <mat-form-field appearance="outline">
                    <mat-label>{{ 'criblage.screening_form.output_stockpile_id' | transloco }}</mat-label>
                    <input matInput formControlName="output_stockpile_id" placeholder="UUID stockpile" required />
                  </mat-form-field>

                  <mat-form-field appearance="outline">
                    <mat-label>{{ 'criblage.screening_form.tonnage_kg' | transloco }}</mat-label>
                    <input matInput type="number" formControlName="tonnage_kg" min="0" required />
                    <mat-hint>kg</mat-hint>
                  </mat-form-field>

                  <mat-checkbox formControlName="is_nonconforming" (change)="onNonconformingChange(i)">
                    {{ 'criblage.screening_form.is_nonconforming' | transloco }}
                  </mat-checkbox>

                  @if (getYieldGroup(i).get('is_nonconforming')?.value) {
                    <mat-form-field appearance="outline" class="full-width">
                      <mat-label>{{ 'criblage.screening_form.nonconformity_reason' | transloco }}</mat-label>
                      <textarea matInput formControlName="nonconformity_reason" rows="2" required></textarea>
                      <mat-hint>Obligatoire si non-conforme</mat-hint>
                    </mat-form-field>
                  }

                  <button mat-stroked-button type="button" color="warn" (click)="removeYield(i)">
                    {{ 'criblage.screening_form.remove_calibre' | transloco }}
                  </button>

                  <hr class="calibre-divider" />
                </div>
              }
            </div>

            <button mat-stroked-button type="button" (click)="addYield()">
              + {{ 'criblage.screening_form.add_calibre' | transloco }}
            </button>
          </div>

          <div class="actions">
            @if (session()?.status === 'ACTIVE') {
              <button mat-raised-button color="warn" type="button" (click)="onPause()" [disabled]="saving()">
                {{ 'criblage.screening_form.pause' | transloco }}
              </button>
            }
            @if (session()?.status === 'PAUSED') {
              <button mat-raised-button color="accent" type="button" (click)="onResume()" [disabled]="saving()">
                {{ 'criblage.screening_form.resume' | transloco }}
              </button>
            }
            @if (session()?.status !== 'COMPLETED') {
              <button
                mat-raised-button color="primary" type="button"
                (click)="onCompleteConfirm()"
                [disabled]="completeForm.invalid || calibreYieldsArray.length === 0 || saving()"
              >
                {{ 'criblage.screening_form.complete' | transloco }}
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
    `.form-container { max-width: 720px; margin: 0 auto; padding: 16px; }`,
    `.form-body { display: flex; flex-direction: column; gap: 12px; }`,
    `.calibre-section { border: 1px solid #ddd; border-radius: 4px; padding: 12px; }`,
    `.calibre-row { display: flex; flex-direction: column; gap: 8px; }`,
    `.calibre-divider { margin: 8px 0; border: 0; border-top: 1px solid #eee; }`,
    `.calibre-list { display: flex; flex-direction: column; gap: 4px; }`,
    `.actions { display: flex; gap: 8px; padding-top: 12px; flex-wrap: wrap; }`,
    `.full-width { width: 100%; }`,
  ],
})
export class ScreeningSessionFormComponent implements OnInit {
  private readonly api = inject(ConcassageApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly snack = inject(MatSnackBar);

  readonly sessionId = signal<string | null>(null);
  readonly session = signal<ScreeningSession | null>(null);
  readonly saving = signal(false);

  readonly openForm = this.fb.group({
    screenId: ['', Validators.required],
    inputStockpileId: [null as string | null],
    operationalDayId: ['', Validators.required],
    operatorId: ['op-placeholder'], // Stub: from auth context
    tenantId: [''],                 // Stub: from auth context
    siteId: [''],                   // Stub: from auth context
    notesMd: [null as string | null],
  });

  readonly completeForm = this.fb.group({
    inputTonnageKg: [0, [Validators.required, Validators.min(0)]],
    calibreYields: this.fb.array([]),
  });

  get calibreYieldsArray(): FormArray {
    return this.completeForm.get('calibreYields') as FormArray;
  }

  getYieldGroup(index: number): FormGroup {
    return this.calibreYieldsArray.at(index) as FormGroup;
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.sessionId.set(id);
      this.api.getScreeningSession(id, '').subscribe({
        next: (s) => {
          this.session.set(s);
          // Pre-populate calibre yields if session has them
          if (s.calibreYields?.length) {
            s.calibreYields.forEach((y) => this.addYieldWithData(y));
          }
        },
        error: () => this.snack.open('criblage.errors.load_failed', 'OK', { duration: 4000 }),
      });
    }
  }

  addYield(): void {
    this.calibreYieldsArray.push(this.buildYieldGroup());
  }

  removeYield(index: number): void {
    this.calibreYieldsArray.removeAt(index);
  }

  onNonconformingChange(index: number): void {
    const group = this.getYieldGroup(index);
    const reasonCtrl = group.get('nonconformity_reason');
    const isNonconforming = group.get('is_nonconforming')?.value as boolean;

    if (isNonconforming) {
      reasonCtrl?.setValidators([Validators.required]);
    } else {
      reasonCtrl?.clearValidators();
      reasonCtrl?.setValue(null);
    }
    reasonCtrl?.updateValueAndValidity();
  }

  onOpen(): void {
    if (this.openForm.invalid) return;
    this.saving.set(true);
    const v = this.openForm.getRawValue();
    this.api
      .openScreeningSession({
        tenantId: v.tenantId ?? '',
        siteId: v.siteId ?? '',
        operationalDayId: v.operationalDayId ?? '',
        screenId: v.screenId ?? '',
        inputStockpileId: v.inputStockpileId ?? null,
        operatorId: v.operatorId ?? '',
        notesMd: v.notesMd,
      })
      .subscribe({
        next: (s) => {
          this.saving.set(false);
          this.snack.open('criblage.screening_form.session_opened', 'OK', { duration: 3000 });
          void this.router.navigate(['/concassage', 'screening', s.id]);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.snack.open('criblage.errors.open_failed', 'OK', { duration: 4000 });
          console.error('Failed to open screening session', err);
        },
      });
  }

  onPause(): void {
    const id = this.sessionId();
    if (!id) return;
    this.saving.set(true);
    this.api.pauseScreeningSession(id).subscribe({
      next: (s) => {
        this.session.set(s);
        this.saving.set(false);
        this.snack.open('criblage.screening_form.session_paused', 'OK', { duration: 3000 });
      },
      error: (err: unknown) => {
        this.saving.set(false);
        console.error('Failed to pause screening session', err);
      },
    });
  }

  onResume(): void {
    const id = this.sessionId();
    if (!id) return;
    this.saving.set(true);
    this.api.resumeScreeningSession(id).subscribe({
      next: (s) => {
        this.session.set(s);
        this.saving.set(false);
        this.snack.open('criblage.screening_form.session_resumed', 'OK', { duration: 3000 });
      },
      error: (err: unknown) => {
        this.saving.set(false);
        console.error('Failed to resume screening session', err);
      },
    });
  }

  onCompleteConfirm(): void {
    if (this.completeForm.invalid) return;
    if (this.calibreYieldsArray.length === 0) {
      this.snack.open('criblage.errors.min_one_calibre', 'OK', { duration: 4000 });
      return;
    }

    const confirmed = window.confirm(
      'Fermer la session de criblage ? Les tonnages par calibre seront transmis au stockpile.',
    );
    if (confirmed) this.onComplete();
  }

  private onComplete(): void {
    const id = this.sessionId();
    if (!id) return;
    this.saving.set(true);

    const v = this.completeForm.getRawValue();
    const calibreYields: CalibreYield[] = (v.calibreYields as Array<Record<string, unknown>>).map((y) => ({
      calibre_code: y['calibre_code'] as string,
      output_stockpile_id: y['output_stockpile_id'] as string,
      tonnage_kg: Number(y['tonnage_kg']),
      is_nonconforming: Boolean(y['is_nonconforming']),
      nonconformity_reason: (y['nonconformity_reason'] as string | null) ?? null,
    }));

    this.api
      .completeScreeningSession(id, {
        inputTonnageKg: v.inputTonnageKg ?? 0,
        calibreYields,
        operatorId: 'op-placeholder', // Stub: from auth context
      })
      .subscribe({
        next: (s) => {
          this.session.set(s);
          this.saving.set(false);
          this.snack.open('criblage.screening_form.session_completed', 'OK', { duration: 4000 });
          void this.router.navigate(['/concassage', 'screening']);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.snack.open('criblage.errors.complete_failed', 'OK', { duration: 4000 });
          console.error('Failed to complete screening session', err);
        },
      });
  }

  onCancel(): void {
    void this.router.navigate(['/concassage', 'screening']);
  }

  private buildYieldGroup(data?: Partial<CalibreYield>): FormGroup {
    return this.fb.group({
      calibre_code: [data?.calibre_code ?? '', Validators.required],
      output_stockpile_id: [data?.output_stockpile_id ?? '', Validators.required],
      tonnage_kg: [data?.tonnage_kg ?? 0, [Validators.required, Validators.min(0)]],
      is_nonconforming: [data?.is_nonconforming ?? false],
      nonconformity_reason: [
        data?.nonconformity_reason ?? null,
        data?.is_nonconforming ? [Validators.required] : [],
      ],
    });
  }

  private addYieldWithData(data: CalibreYield): void {
    this.calibreYieldsArray.push(this.buildYieldGroup(data));
  }
}
