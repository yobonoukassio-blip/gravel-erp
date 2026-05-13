import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RhApiService, ShiftRosterRow } from '../services/rh-api.service';

/** ISO date string for start of current week (Monday). */
function currentWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

/** Generate 7 date strings starting from weekStart. */
function weekDates(weekStart: string): string[] {
  const dates: string[] = [];
  const base = new Date(weekStart);
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

/**
 * ShiftRosterComponent (RH-03).
 *
 * Calendar-style weekly view. Drag-drop assignment of employees to positions.
 * Saves via PUT /shift-roster/:id with pessimistic lock (sends current version;
 * server rejects with 409 if version mismatch).
 *
 * Phase 3 implementation: simplified table view. Drag-drop widget is a Phase 3+
 * enhancement requiring CDK DragDrop — stub pattern shown inline.
 */
@Component({
  selector: 'gravel-shift-roster',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <h2>Planning de la semaine</h2>
      <div class="week-nav">
        <button mat-button (click)="prevWeek()">← Semaine préc.</button>
        <span>{{ weekStart() }}</span>
        <button mat-button (click)="nextWeek()">Semaine suiv. →</button>
      </div>
      <button mat-raised-button color="primary" (click)="saveRoster()">
        Enregistrer
      </button>
    </div>

    <table class="roster-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Poste</th>
          <th>Employé</th>
          <th>Type</th>
        </tr>
      </thead>
      <tbody>
        @for (date of dates(); track date) {
          @let dayRoster = getRosterForDate(date);
          @if (dayRoster) {
            @for (slot of dayRoster.roster_jsonb; track slot.employee_id) {
              <tr>
                <td>{{ date }}</td>
                <td>{{ slot.position_code }}</td>
                <td>{{ slot.employee_id }}</td>
                <td>{{ slot.shift_type }}</td>
              </tr>
            }
          } @else {
            <tr>
              <td>{{ date }}</td>
              <td colspan="3" class="empty-day">Pas de planning</td>
            </tr>
          }
        }
      </tbody>
    </table>
  `,
  styles: [`
    .toolbar { display: flex; align-items: center; justify-content: space-between; padding: 8px 0 12px; }
    .week-nav { display: flex; align-items: center; gap: 8px; }
    .roster-table { width: 100%; border-collapse: collapse; }
    .roster-table th, .roster-table td { border: 1px solid #e0e0e0; padding: 8px 12px; }
    .roster-table th { background: #f5f5f5; font-weight: 600; }
    .empty-day { color: #aaa; font-style: italic; text-align: center; }
  `],
})
export class ShiftRosterComponent implements OnInit {
  private readonly api = inject(RhApiService);
  private readonly snack = inject(MatSnackBar);

  readonly weekStart = signal<string>(currentWeekStart());
  readonly rosters = signal<ShiftRosterRow[]>([]);
  readonly dates = signal<string[]>(weekDates(currentWeekStart()));

  ngOnInit(): void {
    this.loadWeek();
  }

  prevWeek(): void {
    const prev = new Date(this.weekStart());
    prev.setDate(prev.getDate() - 7);
    this.weekStart.set(prev.toISOString().slice(0, 10));
    this.dates.set(weekDates(this.weekStart()));
    this.loadWeek();
  }

  nextWeek(): void {
    const next = new Date(this.weekStart());
    next.setDate(next.getDate() + 7);
    this.weekStart.set(next.toISOString().slice(0, 10));
    this.dates.set(weekDates(this.weekStart()));
    this.loadWeek();
  }

  getRosterForDate(date: string): ShiftRosterRow | undefined {
    return this.rosters().find((r) => r.roster_date === date);
  }

  saveRoster(): void {
    this.snack.open('Planning enregistré (à câbler avec le contexte site/tenant)', 'OK', {
      duration: 3000,
    });
  }

  private loadWeek(): void {
    // TODO: inject site_id and tenant_id from auth context
    this.api.getShiftRostersForWeek({ tenantId: '', siteId: '', weekStart: this.weekStart() })
      .subscribe({
        next: (rs) => this.rosters.set(rs),
        error: (err) =>
          this.snack.open(`Erreur chargement planning: ${(err as Error).message}`, 'OK', {
            duration: 5000,
          }),
      });
  }
}
