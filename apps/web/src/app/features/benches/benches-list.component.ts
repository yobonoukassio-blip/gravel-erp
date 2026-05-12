import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { MatButtonModule } from '@angular/material/button';
import { firstValueFrom } from 'rxjs';

interface Bench {
  id: string;
  productionZoneId: string;
  code: string;
  name: string;
  elevationM: number | null;
  status: string;
}

@Component({
  selector: 'gravel-benches-list',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslocoModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="toolbar">
      <h1>{{ 'benches.list.title' | transloco }}</h1>
      <a mat-flat-button color="primary" routerLink="new" data-testid="bench-new-button">
        {{ 'benches.list.newBench' | transloco }}
      </a>
    </header>

    <table data-testid="bench-table">
      <thead>
        <tr>
          <th>{{ 'benches.columns.code' | transloco }}</th>
          <th>{{ 'benches.columns.name' | transloco }}</th>
          <th>{{ 'benches.columns.elevation' | transloco }}</th>
          <th>{{ 'benches.columns.status' | transloco }}</th>
        </tr>
      </thead>
      <tbody>
        <tr *ngFor="let b of benches()" [attr.data-testid]="'bench-row-' + b.code">
          <td>{{ b.code }}</td>
          <td>{{ b.name }}</td>
          <td>{{ b.elevationM ?? '—' }}</td>
          <td>{{ b.status }}</td>
        </tr>
      </tbody>
    </table>
  `,
})
export class BenchesListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  readonly benches = signal<Bench[]>([]);

  async ngOnInit(): Promise<void> {
    const zoneId = this.route.snapshot.paramMap.get('zoneId') ?? undefined;
    const params = zoneId ? `?zoneId=${encodeURIComponent(zoneId)}` : '';
    const rows = await firstValueFrom(this.http.get<Bench[]>(`/api/benches${params}`));
    this.benches.set(rows);
  }
}
