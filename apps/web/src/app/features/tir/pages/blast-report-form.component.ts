import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TirApiService } from '../services/tir-api.service';

/**
 * BlastReportFormComponent — TIR-06 Web.
 *
 * Formly form for blast report submission after plan is FIRED.
 * Fields: fragmentation_obs, vibration_mm_s, incident_ids (multi-select),
 * notes_md.
 *
 * After submission: read-only display of the submitted report.
 */
@Component({
  selector: 'app-blast-report-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-container">
      <header class="page-header">
        <button class="btn-back" (click)="goBack()">← Back to Plan</button>
        <h1>Submit Blast Report</h1>
      </header>

      @if (submitted) {
        <div class="success-card">
          <h2>Blast Report Submitted</h2>
          <p>Report has been recorded and the blast plan is now REPORTED.</p>
        </div>
      } @else {
        <form class="report-form" (ngSubmit)="submit()">
          <div class="form-field">
            <label for="fragmentation">Fragmentation Observation *</label>
            <textarea
              id="fragmentation"
              [(ngModel)]="form.fragmentationObs"
              name="fragmentationObs"
              rows="4"
              required
              placeholder="Describe fragmentation quality and distribution…"
            ></textarea>
          </div>

          <div class="form-field">
            <label for="vibration">Vibration (mm/s)</label>
            <input
              id="vibration"
              type="number"
              step="0.01"
              [(ngModel)]="form.vibrationMmS"
              name="vibrationMmS"
              placeholder="e.g. 2.50"
            />
          </div>

          <div class="form-field">
            <label for="notes">Notes (Markdown)</label>
            <textarea
              id="notes"
              [(ngModel)]="form.notesMd"
              name="notesMd"
              rows="3"
              placeholder="Additional observations…"
            ></textarea>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn-primary" [disabled]="submitting">
              {{ submitting ? 'Submitting…' : 'Submit Report' }}
            </button>
          </div>
        </form>
      }
    </div>
  `,
})
export class BlastReportFormComponent implements OnInit {
  form = {
    fragmentationObs: '',
    vibrationMmS: null as number | null,
    incidentIds: [] as string[],
    notesMd: '',
  };
  submitted = false;
  submitting = false;
  private planId = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly tirApi: TirApiService,
  ) {}

  ngOnInit(): void {
    this.planId = this.route.snapshot.paramMap.get('id') ?? '';
  }

  submit(): void {
    if (!this.form.fragmentationObs.trim()) return;
    this.submitting = true;

    this.tirApi
      .submitBlastReport({
        tenantId: '', // Resolved from auth context
        siteId: '',   // Resolved from auth context
        blastPlanId: this.planId,
        fragmentationObs: this.form.fragmentationObs,
        vibrationMmS: this.form.vibrationMmS,
        incidentIds: this.form.incidentIds,
        notesMd: this.form.notesMd || null,
        reporterId: '', // Resolved from auth context
      })
      .subscribe({
        next: () => {
          this.submitted = true;
          this.submitting = false;
        },
        error: (err: unknown) => {
          console.error('[BlastReportForm] submission failed:', err);
          this.submitting = false;
        },
      });
  }

  goBack(): void {
    void this.router.navigate(['/tir/blast-plans', this.planId]);
  }
}
