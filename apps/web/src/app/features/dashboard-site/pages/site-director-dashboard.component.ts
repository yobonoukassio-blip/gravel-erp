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
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subscription } from 'rxjs';
import { SseClientService } from '../../../core/sse/sse-client.service';
import { KpiTileComponent } from '../widgets/kpi-tile.component';
import { CostPerTonProvisionalTileComponent } from '../widgets/cost-per-ton-provisional-tile.component';
import { StockpileGaugeComponent, GaugeStatus } from '../widgets/stockpile-gauge.component';
import { SiteMapComponent, SiteMapZone, SiteMapMarker } from '../widgets/site-map.component';

// ---------------------------------------------------------------------------
// API response shape (mirrors backend SiteDirectorDashboard)
// ---------------------------------------------------------------------------

interface OpenIncident { severity: string; count: number; }
interface FuelTank    { tank_id: string; label: string; balance_liters: number; pct_filled: number; anomalies_open: number; }
interface Stockpile   { stockpile_id: string; label: string; balance_kg: string; threshold_status: GaugeStatus; }
interface Equipment   { equipment_id: string; label: string; out_of_service_since_utc: string | null; }

interface VteRevenue {
  weekRevenueXof: string;
  monthRevenueXof: string;
  isProvisional: true;
}

interface SiteDirectorDashboardPayload {
  tonnage_today_kg: string;
  tonnage_yesterday_kg: string;
  tonnage_week_kg: string;
  tonnage_month_kg: string;
  drilling_yield_m_per_h_today: number;
  extraction_yield_t_per_h_today: number;
  tf_rolling_12m: number;
  open_incidents_by_severity: OpenIncident[];
  fuel_tanks: FuelTank[];
  stockpiles: Stockpile[];
  equipment_out_of_service: Equipment[];
  cost_per_ton_provisional: {
    amount_minor: number | string;
    currency: string;
    label: 'cost_per_ton_provisional';
  };
  open_work_orders_count: number;
  vte_revenue: VteRevenue;
}

type SseDelta = { kind: 'kpi.delta'; updated_keys: string[] };

/**
 * SiteDirectorDashboardComponent (DSH-01, D2-70, D2-72).
 *
 * Subscribes to SseClientService for real-time updates.
 * On SSE delta: re-fetches snapshot from REST endpoint.
 */
@Component({
  selector: 'gravel-site-director-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    TranslocoModule,
    MatCardModule,
    MatProgressSpinnerModule,
    KpiTileComponent,
    CostPerTonProvisionalTileComponent,
    StockpileGaugeComponent,
    SiteMapComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './site-director-dashboard.component.html',
})
export class SiteDirectorDashboardComponent implements OnInit, OnDestroy {
  private readonly sseClient = inject(SseClientService);

  readonly loading = signal(true);
  readonly apiError = signal<string | null>(null);
  readonly dashboard = signal<SiteDirectorDashboardPayload | null>(null);
  readonly lastUpdated = signal<Date | null>(null);

  // Map data (Phase 2 static)
  readonly mapZones = signal<SiteMapZone[]>([]);
  readonly mapMarkers = signal<SiteMapMarker[]>([]);

  private sseSubscription: Subscription | null = null;

  // Config (in real app from route params / CLS context)
  // Demo: hardcoded Gravel Ivoire / Carrière Mobaye / today's opday.
  // Real app reads from AuthService claims.
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
        `/api/dashboards/site-director?site_id=${this.siteId}&operational_day_id=${this.operationalDayId}`,
        { credentials: 'include' },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as SiteDirectorDashboardPayload;
      this.dashboard.set(data);
      this.apiError.set(null);
      this.lastUpdated.set(new Date());
    } catch (err) {
      this.apiError.set((err as Error).message ?? 'Erreur réseau');
    } finally {
      this.loading.set(false);
    }
  }

  private connectSse(): void {
    const channel = `${this.tenantId}:${this.siteId}:site-director`;
    this.sseSubscription = this.sseClient
      .connect<SseDelta>(
        `/api/dashboards/site-director/stream?site_id=${this.siteId}`,
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

  // ---------------------------------------------------------------------------
  // Template helpers
  // ---------------------------------------------------------------------------

  tonnageDisplay(kg: string | undefined): string {
    if (!kg) return '—';
    const t = Number(kg) / 1000;
    return t >= 1000 ? `${(t / 1000).toFixed(1)} kt` : `${t.toFixed(1)} t`;
  }

  incidentCount(severity: string): number {
    return (
      this.dashboard()
        ?.open_incidents_by_severity.find((i) => i.severity === severity)?.count ?? 0
    );
  }

  costValue(): number | null {
    const c = this.dashboard()?.cost_per_ton_provisional;
    if (!c) return null;
    return Number(c.amount_minor);
  }

  costCurrency(): string {
    return this.dashboard()?.cost_per_ton_provisional?.currency ?? 'XOF';
  }

  revenueWeek(d: SiteDirectorDashboardPayload): string {
    const v = Number(d.vte_revenue?.weekRevenueXof ?? '0');
    return v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)} M` : v.toLocaleString('fr-CI');
  }

  revenueMonth(d: SiteDirectorDashboardPayload): string {
    const v = Number(d.vte_revenue?.monthRevenueXof ?? '0');
    return v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)} M` : v.toLocaleString('fr-CI');
  }
}
