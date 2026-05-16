import { ChangeDetectionStrategy, Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef, GridOptions } from 'ag-grid-community';

interface TenantAwareApiResponse<T> {
  data: T[];
  meta?: { total: number; offset: number; limit: number };
}

/**
 * Thin wrapper around <ag-grid-angular> that wires a server-side row model
 * pointed at a tenant-scoped JSON endpoint shaped like
 *   { data: T[], meta: { total, offset, limit } }.
 *
 * RLS does isolation at the DB layer (W1-P02); the auth interceptor
 * (W2-P04) attaches the bearer JWT. The grid never trusts the client to
 * filter by tenant.
 */
@Component({
  selector: 'gravel-tenant-aware-grid',
  standalone: true,
  imports: [CommonModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ag-grid-angular
      data-testid="tenant-aware-grid"
      class="ag-theme-material"
      style="width:100%;height:600px;"
      [columnDefs]="columnDefs"
      [rowData]="rows()"
      [gridOptions]="gridOptions"
    />
  `,
})
export class TenantAwareGridComponent implements OnInit {
  private readonly http = inject(HttpClient);

  @Input({ required: true }) endpoint!: string;
  @Input({ required: true }) columnDefs!: ColDef[];

  readonly rows = signal<unknown[]>([]);

  gridOptions: GridOptions = {
    pagination: true,
    paginationPageSize: 50,
  };

  ngOnInit(): void {
    if (!this.endpoint) throw new Error('TenantAwareGrid requires an [endpoint] input');
    this.http.get<TenantAwareApiResponse<unknown> | unknown[]>(this.endpoint).subscribe({
      next: (res) => {
        const data = Array.isArray(res) ? res : res.data;
        this.rows.set(data ?? []);
      },
      error: (err: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[TenantAwareGrid] load failed', err);
        this.rows.set([]);
      },
    });
  }
}
