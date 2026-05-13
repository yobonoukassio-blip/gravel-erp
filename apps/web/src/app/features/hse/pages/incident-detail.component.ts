import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatTableModule } from '@angular/material/table';
import { MatSnackBar } from '@angular/material/snack-bar';
import { switchMap } from 'rxjs/operators';
import {
  HseApiService,
  HseIncidentRow,
  CorrectiveActionRow,
  CapaStatus,
} from '../services/hse-api.service';

const CAPA_STATUS_COLOR: Record<CapaStatus, string> = {
  open: '#e3f2fd',
  in_progress: '#fff9c4',
  done: '#e8f5e9',
  verified: '#c8e6c9',
  closed: '#bdbdbd',
};

/**
 * IncidentDetailComponent — read-only incident detail with CAPA list (HSE-01, HSE-02).
 *
 * Renders:
 *   - Incident metadata (severity badge, category, location, reporter)
 *   - chronology_md rendered as markdown (via <markdown> pipe or inner-html)
 *   - people_impacted table
 *   - Attachments thumbnails (signed URLs — stub: displays sha256 keys)
 *   - CAPA list inline with status badges
 */
@Component({
  selector: 'gravel-incident-detail',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatChipsModule,
    MatDividerModule,
    MatTableModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (incident()) {
      <div class="detail-layout">
        <mat-card class="header-card">
          <mat-card-header>
            <mat-card-title>
              Incident HSE — Sévérité
              <span class="severity-badge" [style.background]="severityColor()">
                {{ incident()!.severity }}
              </span>
            </mat-card-title>
            <mat-card-subtitle>{{ incident()!.location_text }}</mat-card-subtitle>
          </mat-card-header>

          <mat-card-content>
            <p><strong>Catégorie:</strong> {{ incident()!.category }}</p>
            <p><strong>Date:</strong> {{ incident()!.occurred_at_utc | date:'medium':'Africa/Abidjan' }}</p>
            <p><strong>Statut:</strong> {{ incident()!.status }}</p>

            <mat-divider />

            <h3>Chronologie</h3>
            <!-- markdown rendered as pre-formatted for now; replace with ng-markdown pipe in prod -->
            <pre class="chronology">{{ incident()!.chronology_md }}</pre>

            @if (incident()!.people_impacted?.length) {
              <mat-divider />
              <h3>Personnes impliquées</h3>
              <table mat-table [dataSource]="incident()!.people_impacted" class="people-table">
                <ng-container matColumnDef="name">
                  <th mat-header-cell *matHeaderCellDef>Nom</th>
                  <td mat-cell *matCellDef="let p">{{ p.name ?? '—' }}</td>
                </ng-container>
                <ng-container matColumnDef="injury_type">
                  <th mat-header-cell *matHeaderCellDef>Type blessure</th>
                  <td mat-cell *matCellDef="let p">{{ p.injury_type ?? '—' }}</td>
                </ng-container>
                <ng-container matColumnDef="lost_time_h">
                  <th mat-header-cell *matHeaderCellDef>Heures perdues</th>
                  <td mat-cell *matCellDef="let p">{{ p.lost_time_h }}h</td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="['name','injury_type','lost_time_h']"></tr>
                <tr mat-row *matRowDef="let row; columns: ['name','injury_type','lost_time_h']"></tr>
              </table>
            }

            @if (incident()!.content_addressed_attachments?.length) {
              <mat-divider />
              <h3>Pièces jointes ({{ incident()!.content_addressed_attachments.length }})</h3>
              <div class="attachments">
                @for (sha of incident()!.content_addressed_attachments; track sha) {
                  <div class="attachment-thumb" title="{{ sha }}">
                    <span class="sha-preview">{{ sha.slice(0,8) }}…</span>
                  </div>
                }
              </div>
            }
          </mat-card-content>
        </mat-card>

        @if (capas().length) {
          <mat-card class="capa-card">
            <mat-card-header>
              <mat-card-title>Actions Correctives ({{ capas().length }})</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              @for (capa of capas(); track capa.id) {
                <div class="capa-item" [style.background]="capaStatusColor(capa.status)">
                  <strong>{{ capa.description }}</strong>
                  <span class="capa-status">{{ capa.status }}</span>
                  <span class="capa-due">Échéance: {{ capa.due_date_local }}</span>
                </div>
              }
            </mat-card-content>
          </mat-card>
        }
      </div>
    } @else {
      <p>Chargement...</p>
    }
  `,
  styles: [`
    .detail-layout { display: flex; flex-direction: column; gap: 16px; padding: 16px; }
    .severity-badge {
      display: inline-block;
      color: #fff;
      padding: 2px 10px;
      border-radius: 12px;
      font-weight: bold;
      margin-left: 8px;
    }
    .chronology { white-space: pre-wrap; font-family: inherit; background: #f5f5f5; padding: 12px; border-radius: 4px; }
    .attachments { display: flex; flex-wrap: wrap; gap: 8px; }
    .attachment-thumb { width: 80px; height: 80px; background: #e0e0e0; border-radius: 4px; display: flex; align-items: center; justify-content: center; }
    .sha-preview { font-size: 0.6rem; color: #555; }
    .capa-item { padding: 8px 12px; border-radius: 4px; margin-bottom: 8px; display: flex; gap: 16px; align-items: center; }
    .capa-status { font-size: 0.75rem; border: 1px solid #ccc; padding: 2px 6px; border-radius: 8px; }
    .capa-due { font-size: 0.75rem; color: #888; margin-left: auto; }
  `],
})
export class IncidentDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(HseApiService);
  private readonly snack = inject(MatSnackBar);

  readonly incident = signal<HseIncidentRow | null>(null);
  readonly capas = signal<CorrectiveActionRow[]>([]);

  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          const id = params.get('id') ?? '';
          return this.api.getIncident(id);
        }),
      )
      .subscribe({
        next: (inc) => {
          this.incident.set(inc);
          this.api.listCapas(inc.id).subscribe({
            next: (cs) => this.capas.set(cs),
            error: () => this.capas.set([]),
          });
        },
        error: (err) =>
          this.snack.open(`Erreur: ${(err as Error).message}`, 'OK', { duration: 5000 }),
      });
  }

  severityColor(): string {
    const colors: Record<number, string> = {
      1: '#4caf50', 2: '#8bc34a', 3: '#ff9800', 4: '#f44336', 5: '#b71c1c',
    };
    return colors[this.incident()?.severity ?? 1] ?? '#999';
  }

  capaStatusColor(status: CapaStatus): string {
    const colors: Record<CapaStatus, string> = {
      open: '#e3f2fd', in_progress: '#fff9c4', done: '#e8f5e9',
      verified: '#c8e6c9', closed: '#eeeeee',
    };
    return colors[status] ?? '#f5f5f5';
  }
}
