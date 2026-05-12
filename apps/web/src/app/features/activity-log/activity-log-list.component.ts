import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { firstValueFrom } from 'rxjs';

interface ActivityLogRow {
  id: string;
  site_id: string;
  business_date: string;
  shift_id: string | null;
  author_user_id: string | null;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
}

interface SiteLite {
  id: string;
  code: string;
  name: string;
}

/**
 * Read-only filterable view of the journal d'activité quotidien
 * (`daily_activity_log` populated by mobile via the W2-P03 sync pipeline).
 *
 * Per D-35 this is gated to DIRECTION_GROUPE + DIRECTEUR_SITE at the
 * server (@Role) AND the route (roleGuard). RLS scopes the rows to the
 * caller's tenant.
 */
@Component({
  selector: 'gravel-activity-log-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslocoModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>{{ 'activityLog.title' | transloco }}</h1>

    <section class="filters">
      <mat-form-field appearance="outline">
        <mat-label>{{ 'activityLog.filters.site' | transloco }}</mat-label>
        <mat-select
          [(ngModel)]="selectedSiteId"
          (selectionChange)="reload()"
          data-testid="activity-log-site-filter"
        >
          <mat-option [value]="''">{{ 'activityLog.filters.all' | transloco }}</mat-option>
          <mat-option *ngFor="let s of sites()" [value]="s.id">{{ s.name }}</mat-option>
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>{{ 'activityLog.filters.from' | transloco }}</mat-label>
        <input
          matInput
          type="date"
          [(ngModel)]="fromDate"
          (change)="reload()"
          data-testid="activity-log-from"
        />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>{{ 'activityLog.filters.to' | transloco }}</mat-label>
        <input
          matInput
          type="date"
          [(ngModel)]="toDate"
          (change)="reload()"
          data-testid="activity-log-to"
        />
      </mat-form-field>
    </section>

    <table data-testid="activity-log-table">
      <thead>
        <tr>
          <th>{{ 'activityLog.columns.date' | transloco }}</th>
          <th>{{ 'activityLog.columns.shift' | transloco }}</th>
          <th>{{ 'activityLog.columns.author' | transloco }}</th>
          <th>{{ 'activityLog.columns.notes' | transloco }}</th>
          <th>{{ 'activityLog.columns.photo' | transloco }}</th>
        </tr>
      </thead>
      <tbody>
        <tr *ngFor="let row of rows()">
          <td>{{ row.business_date }}</td>
          <td>{{ row.shift_id ?? '—' }}</td>
          <td>{{ row.author_user_id ?? '—' }}</td>
          <td>{{ row.notes ?? '' }}</td>
          <td>
            <a *ngIf="row.photo_url" [href]="row.photo_url" target="_blank" rel="noopener">
              {{ 'activityLog.viewPhoto' | transloco }}
            </a>
          </td>
        </tr>
      </tbody>
    </table>
  `,
  styles: [
    `
      .filters {
        display: flex;
        gap: 1rem;
        flex-wrap: wrap;
        margin-bottom: 1rem;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th,
      td {
        border-bottom: 1px solid #eee;
        padding: 0.5rem 0.75rem;
        text-align: left;
      }
    `,
  ],
})
export class ActivityLogListComponent implements OnInit {
  private readonly http = inject(HttpClient);

  readonly sites = signal<SiteLite[]>([]);
  readonly rows = signal<ActivityLogRow[]>([]);
  selectedSiteId = '';
  fromDate = '';
  toDate = '';

  async ngOnInit(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: SiteLite[] }>('/api/sites?limit=200'),
      );
      this.sites.set(res.data);
    } catch {
      this.sites.set([]);
    }
    await this.reload();
  }

  async reload(): Promise<void> {
    let params = new HttpParams();
    if (this.selectedSiteId) params = params.set('siteId', this.selectedSiteId);
    if (this.fromDate) params = params.set('from', this.fromDate);
    if (this.toDate) params = params.set('to', this.toDate);
    try {
      const rows = await firstValueFrom(
        this.http.get<ActivityLogRow[]>('/api/activity-log', { params }),
      );
      this.rows.set(rows);
    } catch {
      this.rows.set([]);
    }
  }
}
