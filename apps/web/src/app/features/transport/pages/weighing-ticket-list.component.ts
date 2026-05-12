import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef } from 'ag-grid-community';
import { TransportApiService, WeighingTicket } from '../services/transport-api.service';

/**
 * Weighing ticket read-only list (TRP-02).
 *
 * Columns per plan: ticket_number, gross_kg, tare_kg, net_kg, truck, driver,
 * material, weighed_at, content_hash (truncated), signatures icon,
 * is_offline_generated badge.
 */
@Component({
  selector: 'gravel-weighing-ticket-list',
  standalone: true,
  imports: [CommonModule, TranslocoModule, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './weighing-ticket-list.component.html',
  styles: [
    `
      .toolbar { display: flex; justify-content: space-between; align-items: center; }
      .badge { padding: 2px 8px; border-radius: 12px; color: white; font-size: 0.75rem; }
      .badge-offline { background: #ed6c02; }
      .badge-online { background: #2e7d32; }
      .hash { font-family: monospace; font-size: 0.85rem; }
    `,
  ],
})
export class WeighingTicketListComponent implements OnInit {
  private readonly api = inject(TransportApiService);
  private readonly snack = inject(MatSnackBar);

  readonly rows = signal<WeighingTicket[]>([]);
  readonly operationalDayId = signal<string>('current');

  readonly columnDefs: ColDef<WeighingTicket>[] = [
    { field: 'ticket_number', headerName: 'transport.columns.ticket_number', width: 220 },
    { field: 'gross_kg', headerName: 'transport.columns.gross_kg', width: 110 },
    { field: 'tare_kg', headerName: 'transport.columns.tare_kg', width: 110 },
    { field: 'net_kg', headerName: 'transport.columns.net_kg', width: 110 },
    { field: 'truck_equipment_id', headerName: 'transport.columns.truck', width: 140 },
    { field: 'driver_id', headerName: 'transport.columns.driver', width: 140 },
    { field: 'material_type', headerName: 'transport.columns.material', width: 130 },
    { field: 'weighed_at_local', headerName: 'transport.columns.weighed_at', width: 180 },
    {
      field: 'content_hash',
      headerName: 'transport.columns.content_hash',
      width: 130,
      valueFormatter: (p) =>
        typeof p.value === 'string' ? p.value.slice(0, 12) + '…' : '',
      cellClass: 'hash',
    },
    {
      colId: 'signatures',
      headerName: 'transport.columns.signatures',
      width: 120,
      valueGetter: (p) =>
        (p.data?.client_signature_blob_sha256 ? 'C' : '') +
        (p.data?.driver_signature_blob_sha256 ? 'D' : ''),
    },
    {
      field: 'is_offline_generated',
      headerName: 'transport.columns.is_offline_generated',
      width: 130,
      cellRenderer: (p: { value: boolean }) =>
        p.value
          ? '<span class="badge badge-offline">offline</span>'
          : '<span class="badge badge-online">online</span>',
    },
  ];

  ngOnInit(): void {
    this.api.listTickets(this.operationalDayId()).subscribe({
      next: (ts) => this.rows.set(ts),
      error: (err) => this.snack.open(`Error: ${err.message}`, 'OK', { duration: 5000 }),
    });
  }
}
