import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgGridAngular } from 'ag-grid-angular';
import type { CellClickedEvent, ColDef, GridApi, GridReadyEvent } from 'ag-grid-community';

interface AlertRow {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  source_event_type: string;
  created_at_utc: string;
  status: 'open' | 'acked' | 'resolved';
  recipients: string[];
  payload: Record<string, unknown>;
}

/**
 * AlertsInboxComponent (DSH-01, D2-74).
 *
 * AG Grid with columns: severity, source_event_type, created_at, payload
 * summary, recipients, status, age.
 * Action buttons: Ack and Resolve per row.
 */
@Component({
  selector: 'gravel-alerts-inbox',
  standalone: true,
  imports: [
    CommonModule,
    TranslocoModule,
    MatButtonModule,
    MatChipsModule,
    AgGridAngular,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './alerts-inbox.component.html',
})
export class AlertsInboxComponent implements OnInit {
  private readonly snack = inject(MatSnackBar);

  readonly rows = signal<AlertRow[]>([]);
  readonly loading = signal(true);

  private gridApi: GridApi<AlertRow> | null = null;

  readonly columnDefs: ColDef[] = [
    {
      field: 'severity',
      headerName: 'Sévérité',
      width: 110,
      cellRenderer: (params: { value: string }) => {
        const colors: Record<string, string> = {
          critical: '#dc2626',
          high: '#d97706',
          medium: '#2563eb',
          low: '#6b7280',
        };
        const c = colors[params.value] ?? '#6b7280';
        return `<span style="background:${c};color:#fff;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">${params.value}</span>`;
      },
    },
    {
      field: 'sourceEventType',
      headerName: 'Source',
      flex: 2,
    },
    {
      field: 'createdAtUtc',
      headerName: 'Créé le',
      width: 160,
      valueFormatter: (p) =>
        p.value ? new Date(p.value as string).toLocaleString('fr-CI') : '—',
    },
    {
      headerName: 'Résumé',
      flex: 3,
      valueGetter: (p) => {
        const row = p.data as AlertRow;
        if (!row) return '';
        return JSON.stringify(row.payload).slice(0, 120);
      },
    },
    {
      field: 'status',
      headerName: 'Statut',
      width: 100,
    },
    {
      headerName: 'Âge',
      width: 100,
      valueGetter: (p) => {
        const row = p.data as AlertRow;
        if (!row?.created_at_utc) return '';
        const diffMs = Date.now() - new Date(row.created_at_utc).getTime();
        const h = Math.floor(diffMs / 3_600_000);
        const m = Math.floor((diffMs % 3_600_000) / 60_000);
        return h > 0 ? `${h}h${m}m` : `${m}m`;
      },
    },
    {
      headerName: 'Actions',
      width: 180,
      sortable: false,
      filter: false,
      cellRenderer: (params: { data: AlertRow }) => {
        const row = params.data;
        if (!row || row.status === 'resolved') return '';
        const ackDisabled = row.status === 'acked' ? 'disabled' : '';
        return `
          <button data-action="ack" data-id="${row.id}" ${ackDisabled}
            style="margin-right:4px;padding:2px 10px;cursor:pointer;">Ack</button>
          <button data-action="resolve" data-id="${row.id}"
            style="padding:2px 10px;cursor:pointer;">Résoudre</button>
        `;
      },
    },
  ];

  ngOnInit(): void {
    void this.loadAlerts();
  }

  onGridReady(evt: GridReadyEvent<AlertRow>): void {
    this.gridApi = evt.api;
  }

  onCellClicked(evt: CellClickedEvent<AlertRow>): void {
    const target = evt.event?.target as HTMLButtonElement | null;
    if (!target || !evt.data) return;
    const action = target.dataset['action'];
    const id = target.dataset['id'];
    if (!action || !id) return;
    if (action === 'ack') void this.ackAlert(id);
    if (action === 'resolve') void this.resolveAlert(id);
  }

  private async loadAlerts(): Promise<void> {
    this.loading.set(true);
    try {
      const res = await fetch('/api/alerts', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as AlertRow[];
      this.rows.set(data);
    } catch (err) {
      this.snack.open(`Erreur: ${(err as Error).message}`, 'OK', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }

  private async ackAlert(id: string): Promise<void> {
    try {
      const res = await fetch(`/api/alerts/${id}/ack`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await this.loadAlerts();
      this.snack.open('Alerte acquittée', '', { duration: 3000 });
    } catch (err) {
      this.snack.open(`Erreur: ${(err as Error).message}`, 'OK', { duration: 5000 });
    }
  }

  private async resolveAlert(id: string): Promise<void> {
    try {
      const res = await fetch(`/api/alerts/${id}/resolve`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await this.loadAlerts();
      this.snack.open('Alerte résolue', '', { duration: 3000 });
    } catch (err) {
      this.snack.open(`Erreur: ${(err as Error).message}`, 'OK', { duration: 5000 });
    }
  }
}
