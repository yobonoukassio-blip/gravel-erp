import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoModule } from '@jsverse/transloco';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  ProductionEquipment,
  TransportApiService,
  TruckRotation,
} from '../services/transport-api.service';

/**
 * Dispatch board (TRP-03). Manual truck assignment.
 *
 * Layout: left pane — pending rotations (no truck assigned); right pane —
 * available active trucks. Operator selects a rotation, then a truck,
 * triggering `assignTruck` (POST /rotations/:id/assign).
 */
@Component({
  selector: 'gravel-dispatch-board',
  standalone: true,
  imports: [CommonModule, TranslocoModule, MatButtonModule, MatCardModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dispatch-board.component.html',
  styles: [
    `
      .board { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
      .pane { padding: 12px; }
      .pane h2 { font-size: 1.1rem; margin: 0 0 12px; }
      .card { margin-bottom: 8px; cursor: pointer; }
      .card.selected { outline: 2px solid #1976d2; }
      .empty { color: #999; font-style: italic; }
    `,
  ],
})
export class DispatchBoardComponent implements OnInit {
  private readonly api = inject(TransportApiService);
  private readonly snack = inject(MatSnackBar);

  readonly pending = signal<TruckRotation[]>([]);
  readonly trucks = signal<ProductionEquipment[]>([]);
  readonly selectedRotationId = signal<string | null>(null);

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.api.listPendingDispatch().subscribe({
      next: (rs) => this.pending.set(rs),
      error: (err) => this.snack.open(`Error: ${err.message}`, 'OK', { duration: 5000 }),
    });
    this.api.listAvailableTrucks().subscribe({
      next: (ts) => this.trucks.set(ts),
      error: () => {
        // best-effort — empty truck list is non-fatal
      },
    });
  }

  selectRotation(id: string): void {
    this.selectedRotationId.set(id);
  }

  assign(truckId: string): void {
    const rotationId = this.selectedRotationId();
    if (!rotationId) {
      this.snack.open('Sélectionnez d\'abord une rotation', 'OK', {
        duration: 3000,
      });
      return;
    }
    this.assignTruck(rotationId, truckId);
  }

  assignTruck(rotationId: string, truckId: string): void {
    this.api.assignTruck(rotationId, truckId).subscribe({
      next: () => {
        this.snack.open('Camion affecté', 'OK', { duration: 3000 });
        this.selectedRotationId.set(null);
        this.refresh();
      },
      error: (err) =>
        this.snack.open(`Erreur: ${err.message}`, 'OK', { duration: 5000 }),
    });
  }
}
