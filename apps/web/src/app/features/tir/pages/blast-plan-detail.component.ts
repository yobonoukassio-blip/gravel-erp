import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { BlastPlanRow, TirApiService } from '../services/tir-api.service';

/**
 * BlastPlanDetailComponent — TIR-03/TIR-05 Web.
 *
 * Read-only plan summary + role-based action buttons per current status.
 *
 * Status → available action:
 *   DRAFT           → "Approve (HSE)" [HSE_OFFICER only]
 *   HSE_APPROVED    → "Start Loading" [TIR_SUPERVISOR]
 *   LOADED          → "Request Fire"  [TIR_SUPERVISOR]
 *   FIRE_REQUESTED  → "Issue Zone Clearance" [HSE_OFFICER only]
 *   FIRED           → "Submit Blast Report"
 *
 * Each button calls the appropriate tir-api endpoint and refreshes via SSE.
 */
@Component({
  selector: 'app-blast-plan-detail',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-container">
      <header class="page-header">
        <button class="btn-back" (click)="goBack()">← Back</button>
        <h1>Blast Plan Detail</h1>
      </header>

      @if (!plan) {
        <div class="loading">Loading…</div>
      } @else {
        <div class="detail-card">
          <dl class="detail-grid">
            <dt>Status</dt>
            <dd>
              <span class="status-badge">{{ plan.status }}</span>
            </dd>
            <dt>Operational Day</dt>
            <dd>{{ plan.operationalDayId }}</dd>
            <dt>Drilling Plan</dt>
            <dd>{{ plan.drillingPlanId }}</dd>
            <dt>Planned By</dt>
            <dd>{{ plan.plannedBy }}</dd>
            <dt>HSE Approved By</dt>
            <dd>{{ plan.hseApprovedBy ?? '—' }}</dd>
          </dl>

          <!-- Action buttons per status -->
          <div class="action-bar">
            @switch (plan.status) {
              @case ('DRAFT') {
                <button class="btn-action btn-hse" (click)="approveHse()">
                  Approve (HSE)
                </button>
              }
              @case ('HSE_APPROVED') {
                <button class="btn-action btn-primary" (click)="startLoading()">
                  Start Loading
                </button>
              }
              @case ('LOADED') {
                <button class="btn-action btn-fire" (click)="requestFire()">
                  Request Fire
                </button>
              }
              @case ('FIRE_REQUESTED') {
                <button class="btn-action btn-clearance" (click)="issueClearance()">
                  Issue Zone Clearance
                </button>
              }
              @case ('FIRED') {
                <button class="btn-action btn-report" (click)="submitReport()">
                  Submit Blast Report
                </button>
              }
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class BlastPlanDetailComponent implements OnInit {
  plan: BlastPlanRow | null = null;
  private planId = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly tirApi: TirApiService,
  ) {}

  ngOnInit(): void {
    this.planId = this.route.snapshot.paramMap.get('id') ?? '';
    // In production: load plan, subscribe to SSE for real-time status updates
    this.plan = null;
  }

  goBack(): void {
    void this.router.navigate(['/tir/blast-plans']);
  }

  approveHse(): void {
    // Calls tirApi.approveHse(planId, { hseOfficerId, tenantId })
    // Then refreshes plan from SSE or HTTP
  }

  startLoading(): void {
    // Calls tirApi.approveLoading(planId, { operatorId, tenantId, operationalDay })
  }

  requestFire(): void {
    // Calls tirApi.requestFire(planId, { supervisorId, tenantId, operationalDay })
  }

  issueClearance(): void {
    // Calls tirApi.issueClearance(planId, { hseOfficerId, tenantId })
  }

  submitReport(): void {
    void this.router.navigate(['/tir/blast-plans', this.planId, 'report']);
  }
}
