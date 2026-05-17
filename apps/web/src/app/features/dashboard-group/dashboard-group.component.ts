import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  signal,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { KpiTileComponent } from '../dashboard-site/widgets/kpi-tile.component';

interface ConsolidatedResponse {
  pivotCurrency?: string;
  totalRevenueMinor?: string;
  totalCostMinor?: string;
  totalMarginMinor?: string;
  marginPct?: number;
  bySite?: Array<{
    siteId?: string;
    revenueMinor?: string;
    costMinor?: string;
    marginMinor?: string;
    tonnageT?: number;
  }>;
}

interface SitePnL {
  siteId: string;
  revenueMinor: string;
  costMinor: string;
  marginMinor: string;
  tonnageT: number;
  marginPct: number;
}

interface GroupDashboardData {
  pivotCurrency: string;
  periodLabel: string;
  totalRevenueMinor: string;
  totalCostMinor: string;
  totalMarginMinor: string;
  marginPct: number;
  sites: SitePnL[];
}

@Component({
  selector: 'gravel-dashboard-group',
  standalone: true,
  imports: [
    CommonModule,
    TranslocoModule,
    MatCardModule,
    MatTableModule,
    MatProgressSpinnerModule,
    KpiTileComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-group.component.html',
})
export class DashboardGroupComponent implements OnInit {
  private readonly http = inject(HttpClient);

  readonly loading = signal(true);
  readonly data = signal<GroupDashboardData | null>(null);
  readonly displayedColumns = ['siteId', 'revenue', 'cost', 'margin', 'tonnage', 'marginPct'];

  async ngOnInit(): Promise<void> {
    try {
      const year = new Date().getFullYear();
      const resp = await firstValueFrom(
        this.http.get<ConsolidatedResponse>(
          `/api/analytics/consolidation?pivot=XOF&from=${year}-01-01&to=${year}-12-31`,
        ),
      );

      const sites: SitePnL[] = (resp.bySite ?? []).map((s) => {
        const rev = Number(s.revenueMinor ?? '0');
        const cost = Number(s.costMinor ?? '0');
        return {
          siteId: s.siteId ?? '',
          revenueMinor: s.revenueMinor ?? '0',
          costMinor: s.costMinor ?? '0',
          marginMinor: s.marginMinor ?? '0',
          tonnageT: s.tonnageT ?? 0,
          marginPct: rev > 0 ? Math.round(((rev - cost) / rev) * 100) : 0,
        };
      });

      this.data.set({
        pivotCurrency: resp.pivotCurrency ?? 'XOF',
        periodLabel: `${year}`,
        totalRevenueMinor: resp.totalRevenueMinor ?? '0',
        totalCostMinor: resp.totalCostMinor ?? '0',
        totalMarginMinor: resp.totalMarginMinor ?? '0',
        marginPct: resp.marginPct ?? 0,
        sites,
      });
    } catch {
      this.data.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  formatMinor(minor: string | undefined): string {
    if (!minor || minor === '0') return '—';
    const v = Number(minor);
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} M`;
    if (v >= 1_000) return `${Math.round(v / 1_000)} k`;
    return v.toLocaleString('fr-CI');
  }
}
