import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { MatButtonModule } from '@angular/material/button';
import { firstValueFrom } from 'rxjs';

interface Permit {
  id: string;
  type: string;
  authority: string;
  reference: string;
  validFrom: string;
  validTo: string;
  status: string;
}

@Component({
  selector: 'gravel-permits-list',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslocoModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="toolbar">
      <h1>{{ 'permits.list.title' | transloco }}</h1>
      <a mat-flat-button color="primary" routerLink="new" data-testid="permit-new-button">
        {{ 'permits.list.newPermit' | transloco }}
      </a>
    </header>

    <table data-testid="permit-table">
      <thead>
        <tr>
          <th>{{ 'permits.columns.type' | transloco }}</th>
          <th>{{ 'permits.columns.authority' | transloco }}</th>
          <th>{{ 'permits.columns.reference' | transloco }}</th>
          <th>{{ 'permits.columns.validFrom' | transloco }}</th>
          <th>{{ 'permits.columns.validTo' | transloco }}</th>
          <th>{{ 'permits.columns.status' | transloco }}</th>
        </tr>
      </thead>
      <tbody>
        <tr *ngFor="let p of permits()" [attr.data-testid]="'permit-row-' + p.reference">
          <td>{{ p.type }}</td>
          <td>{{ p.authority }}</td>
          <td>{{ p.reference }}</td>
          <td>{{ p.validFrom }}</td>
          <td>{{ p.validTo }}</td>
          <td>{{ p.status }}</td>
        </tr>
      </tbody>
    </table>
  `,
})
export class PermitsListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  readonly permits = signal<Permit[]>([]);

  async ngOnInit(): Promise<void> {
    const siteId = this.route.snapshot.paramMap.get('siteId') ?? undefined;
    const params = siteId ? `?siteId=${encodeURIComponent(siteId)}` : '';
    const rows = await firstValueFrom(this.http.get<Permit[]>(`/api/permits${params}`));
    this.permits.set(rows);
  }
}
