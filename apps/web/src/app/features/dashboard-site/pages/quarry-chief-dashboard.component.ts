import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subscription } from 'rxjs';
import { SseClientService } from '../../../core/sse/sse-client.service';
import { KpiTileComponent } from '../widgets/kpi-tile.component';

interface ActiveDrillingPlan {
  id: string;
  label: string;
  planned: number;
  drilled: number;
  progress_pct: number;
}

interface QuarryChiefDashboardPayload {
  active_drilling_plans: ActiveDrillingPlan[];
  crews_assigned_today: number;
  tolerance_violations_today: number;
  truck_rotations_today: { total: number; in_progress: number; completed: number };
  weighing_queue_size: number;
}

type SseDelta = { kind: 'kpi.delta'; updated_keys: string[] };

/**
 * QuarryChiefDashboardComponent (DSH-01, D2-73).
 *
 * Operational dashboard for Chef Carrière:
 * - Active drilling plans with progress bars
 * - Crew count, tolerance violations
 * - Truck rotations today
 * - Weighing queue size
 */
@Component({
  selector: 'gravel-quarry-chief-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    TranslocoModule,
    MatCardModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    KpiTileComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quarry-chief-dashboard.component.html',
})
export class QuarryChiefDashboardComponent implements OnInit, OnDestroy {
  private readonly sseClient = inject(SseClientService);

  readonly loading = signal(true);
  readonly dashboard = signal<QuarryChiefDashboardPayload | null>(null);
  readonly lastUpdated = signal<Date | null>(null);

  private sseSubscription: Subscription | null = null;

  // Demo: hardcoded Gravel Ivoire / Carrière Mobaye / today's opday.
  private readonly siteId = '5213953c-3820-4da4-97ed-89bfbd605c07';
  private readonly operationalDayId = '60000000-0000-0000-0000-000000000016';
  private readonly tenantId = '24cd97f8-0170-453e-89da-e9213dd710d7';

  ngOnInit(): void {
    void this.loadSnapshot();
    this.connectSse();
  }

  ngOnDestroy(): void {
    this.sseSubscription?.unsubscribe();
  }

  private async loadSnapshot(): Promise<void> {
    this.loading.set(true);
    try {
      const res = await fetch(
        `/api/dashboards/quarry-chief?site_id=${this.siteId}&operational_day_id=${this.operationalDayId}`,
        { credentials: 'include' },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as QuarryChiefDashboardPayload;
      this.dashboard.set(data);
      this.lastUpdated.set(new Date());
    } catch {
      // Keep previous data
    } finally {
      this.loading.set(false);
    }
  }

  private connectSse(): void {
    const channel = `${this.tenantId}:${this.siteId}:quarry-chief`;
    this.sseSubscription = this.sseClient
      .connect<SseDelta>(
        `/api/dashboards/quarry-chief/stream?site_id=${this.siteId}`,
        { channel },
      )
      .subscribe({
        next: (delta) => {
          if (delta.kind === 'kpi.delta') {
            void this.loadSnapshot();
          }
        },
      });
  }
}
