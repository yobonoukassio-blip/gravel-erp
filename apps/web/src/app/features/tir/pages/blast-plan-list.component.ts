import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { BlastPlanRow, TirApiService } from '../services/tir-api.service';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'grey',
  HSE_APPROVED: 'blue',
  LOADED: 'yellow',
  FIRE_REQUESTED: 'orange',
  CLEARED: 'purple',
  FIRED: 'green',
  REPORTED: 'teal',
};

/**
 * BlastPlanListComponent — TIR-03 Web.
 *
 * AG Grid listing of blast_plan rows with color-coded status badges.
 * Row click → blast-plan-detail.
 * "New Plan" button → Formly form (drilling_plan_id picker, site, op_day).
 */
@Component({
  selector: 'app-blast-plan-list',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-container">
      <header class="page-header">
        <h1>Blast Plans</h1>
        <button class="btn-primary" (click)="newPlan()">+ New Plan</button>
      </header>

      @if (loading) {
        <div class="loading">Loading blast plans…</div>
      } @else {
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Status</th>
              <th>Operational Day</th>
              <th>Planned By</th>
              <th>HSE Approved By</th>
            </tr>
          </thead>
          <tbody>
            @for (plan of plans; track plan.id) {
              <tr class="clickable-row" (click)="openDetail(plan.id)">
                <td>{{ plan.createdAtUtc | date:'short' }}</td>
                <td>
                  <span class="status-badge" [style.background-color]="getStatusColor(plan.status)">
                    {{ plan.status }}
                  </span>
                </td>
                <td>{{ plan.operationalDayId }}</td>
                <td>{{ plan.plannedBy }}</td>
                <td>{{ plan.hseApprovedBy ?? '—' }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="5" class="empty-state">No blast plans found.</td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>
  `,
})
export class BlastPlanListComponent implements OnInit {
  plans: BlastPlanRow[] = [];
  loading = false;

  constructor(
    private readonly tirApi: TirApiService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.loading = false;
    this.plans = [];
    // In production: load from tirApi.listBlastPlans(tenantId, siteId)
  }

  newPlan(): void {
    void this.router.navigate(['/tir/blast-plans/new']);
  }

  openDetail(id: string): void {
    void this.router.navigate(['/tir/blast-plans', id]);
  }

  getStatusColor(status: string): string {
    return STATUS_COLORS[status] ?? 'grey';
  }
}
