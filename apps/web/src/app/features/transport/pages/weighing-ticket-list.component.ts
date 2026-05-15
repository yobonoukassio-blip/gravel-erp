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

  readonly columnDefs: ColDef<any>[] = [
    { field: 'ticketNumber', headerName: 'Ticket Number', width: 220 },
    { field: 'grossKg', headerName: 'Gross Kg', width: 110 },
    { field: 'tareKg', headerName: 'Tare Kg', width: 110 },
    { field: 'netKg', headerName: 'Net Kg', width: 110 },
    { field: 'truckEquipmentId', headerName: 'Camion', width: 140 },
    { field: 'driverId', headerName: 'Chauffeur', width: 140 },
    { field: 'materialType', headerName: 'Matériau', width: 130 },
    { field: 'weighedAtLocal', headerName: 'Weighed At', width: 180 },
    {
      field: 'contentHash',
      headerName: 'Content Hash',
      width: 130,
      valueFormatter: (p) =>
        typeof p.value === 'string' ? p.value.slice(0, 12) + '…' : '',
      cellClass: 'hash',
    },
    {
      colId: 'signatures',
      headerName: 'Signatures',
      width: 120,
      valueGetter: (p) =>
        (p.data?.client_signature_blob_sha256 ? 'C' : '') +
        (p.data?.driver_signature_blob_sha256 ? 'D' : ''),
    },
    {
      field: 'isOfflineGenerated',
      headerName: 'Is Offline Generated',
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
