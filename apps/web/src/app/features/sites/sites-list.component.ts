import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { MatButtonModule } from '@angular/material/button';
import type { ColDef } from 'ag-grid-community';
import { TenantAwareGridComponent } from '../../shared/ag-grid/tenant-aware-grid.component';

@Component({
  selector: 'gravel-sites-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    TranslocoModule,
    MatButtonModule,
    TenantAwareGridComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sites-list">
      <header class="toolbar">
        <h1>{{ 'sites.list.title' | transloco }}</h1>
        <a
          mat-flat-button
          color="primary"
          routerLink="new"
          data-testid="site-new-button"
        >
          {{ 'sites.list.newSite' | transloco }}
        </a>
      </header>

      <gravel-tenant-aware-grid
        endpoint="/api/sites"
        [columnDefs]="columnDefs"
      />
    </div>
  `,
  styles: [
    `
      .sites-list {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
    `,
  ],
})
export class SitesListComponent {
  readonly columnDefs: ColDef[] = [
    { field: 'code', headerName: 'sites.columns.code', sortable: true, width: 140 },
    { field: 'name', headerName: 'sites.columns.name', sortable: true, flex: 1 },
    { field: 'functionalCurrency', headerName: 'sites.columns.currency', width: 120 },
    { field: 'ianaTimezone', headerName: 'sites.columns.timezone', width: 200 },
    { field: 'status', headerName: 'sites.columns.status', width: 120 },
  ];
}
