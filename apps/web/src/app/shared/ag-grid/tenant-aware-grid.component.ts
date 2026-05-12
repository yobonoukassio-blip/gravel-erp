import { ChangeDetectionStrategy, Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { AgGridAngular } from 'ag-grid-angular';
import type {
  ColDef,
  GridOptions,
  GridReadyEvent,
  IServerSideDatasource,
  IServerSideGetRowsParams,
} from 'ag-grid-community';

interface TenantAwareApiResponse<T> {
  data: T[];
  meta: { total: number; offset: number; limit: number };
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
      [gridOptions]="gridOptions"
      (gridReady)="onGridReady($event)"
    />
  `,
})
export class TenantAwareGridComponent implements OnInit {
  private readonly http = inject(HttpClient);

  @Input({ required: true }) endpoint!: string;
  @Input({ required: true }) columnDefs!: ColDef[];

  gridOptions: GridOptions = {
    rowModelType: 'serverSide',
    cacheBlockSize: 50,
    pagination: true,
    paginationPageSize: 50,
  };

  ngOnInit(): void {
    if (!this.endpoint) throw new Error('TenantAwareGrid requires an [endpoint] input');
  }

  onGridReady(event: GridReadyEvent): void {
    event.api.setGridOption('serverSideDatasource', this.buildDatasource());
  }

  private buildDatasource(): IServerSideDatasource {
    const http = this.http;
    const endpoint = this.endpoint;
    return {
      getRows: (params: IServerSideGetRowsParams) => {
        const startRow = params.request.startRow ?? 0;
        const endRow = params.request.endRow ?? startRow + 50;
        const limit = endRow - startRow;
        const httpParams = new HttpParams()
          .set('offset', String(startRow))
          .set('limit', String(limit));

        http.get<TenantAwareApiResponse<unknown>>(endpoint, { params: httpParams }).subscribe({
          next: (res) => {
            params.success({ rowData: res.data, rowCount: res.meta.total });
          },
          error: (err: unknown) => {
            // eslint-disable-next-line no-console
            console.error('[TenantAwareGrid] datasource error', err);
            params.fail();
          },
        });
      },
    };
  }
}
