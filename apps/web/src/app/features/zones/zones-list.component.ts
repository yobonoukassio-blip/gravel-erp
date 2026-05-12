import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { MatButtonModule } from '@angular/material/button';
import { firstValueFrom } from 'rxjs';

interface Zone {
  id: string;
  siteId: string;
  code: string;
  name: string;
  status: string;
}

@Component({
  selector: 'gravel-zones-list',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslocoModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="toolbar">
      <h1>{{ 'zones.list.title' | transloco }}</h1>
      <a mat-flat-button color="primary" routerLink="new" data-testid="zone-new-button">
        {{ 'zones.list.newZone' | transloco }}
      </a>
    </header>

    <table class="zone-table" data-testid="zone-table">
      <thead>
        <tr>
          <th>{{ 'zones.columns.code' | transloco }}</th>
          <th>{{ 'zones.columns.name' | transloco }}</th>
          <th>{{ 'zones.columns.status' | transloco }}</th>
        </tr>
      </thead>
      <tbody>
        <tr *ngFor="let z of zones()" [attr.data-testid]="'zone-row-' + z.code">
          <td>{{ z.code }}</td>
          <td>{{ z.name }}</td>
          <td>{{ z.status }}</td>
        </tr>
      </tbody>
    </table>
  `,
  styles: [
    `
      .toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
      }
      .zone-table {
        width: 100%;
        border-collapse: collapse;
      }
      .zone-table th,
      .zone-table td {
        border-bottom: 1px solid #eee;
        padding: 0.5rem 0.75rem;
        text-align: left;
      }
    `,
  ],
})
export class ZonesListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);

  readonly zones = signal<Zone[]>([]);

  async ngOnInit(): Promise<void> {
    const siteId = this.route.snapshot.paramMap.get('siteId') ?? undefined;
    const params = siteId ? `?siteId=${encodeURIComponent(siteId)}` : '';
    const rows = await firstValueFrom(this.http.get<Zone[]>(`/api/zones${params}`));
    this.zones.set(rows);
  }
}
