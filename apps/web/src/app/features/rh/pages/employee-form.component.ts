import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatBadgeModule } from '@angular/material/badge';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RhApiService, EmployeeRow, CertificationRow, CertStatus } from '../services/rh-api.service';

/** Days until expiry threshold for EXPIRING_SOON badge */
const EXPIRING_SOON_DAYS = 30;

/** Compute cert status relative to today */
function computeCertStatus(row: CertificationRow): CertStatus {
  const today = new Date().toISOString().slice(0, 10);
  if (row.valid_to < today) return 'EXPIRED';

  const daysLeft =
    (new Date(row.valid_to).getTime() - new Date(today).getTime()) / 86_400_000;
  if (daysLeft <= EXPIRING_SOON_DAYS) return 'EXPIRING_SOON';

  return 'VALID';
}

const STATUS_COLOR: Record<CertStatus, string> = {
  VALID: '#2e7d32',
  EXPIRING_SOON: '#f57c00',
  EXPIRED: '#c62828',
};

/**
 * EmployeeFormComponent (RH-01, RH-04).
 *
 * Formly-style form for create/edit employee.
 * Includes "Habilitations" sub-section with expiry warning badges.
 */
@Component({
  selector: 'gravel-employee-form',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatBadgeModule,
    MatChipsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>Fiche employé</h2>

    <form #form="ngForm" (ngSubmit)="onSubmit()">
      <div class="form-row">
        <mat-form-field>
          <mat-label>Prénom</mat-label>
          <input matInput name="first_name" [(ngModel)]="model.first_name" required />
        </mat-form-field>
        <mat-form-field>
          <mat-label>Nom</mat-label>
          <input matInput name="last_name" [(ngModel)]="model.last_name" required />
        </mat-form-field>
      </div>

      <div class="form-row">
        <mat-form-field>
          <mat-label>Matricule</mat-label>
          <input matInput name="employee_number" [(ngModel)]="model.employee_number" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>Type de contrat</mat-label>
          <mat-select name="contract_type" [(ngModel)]="model.contract_type" required>
            <mat-option value="CDI">CDI</mat-option>
            <mat-option value="CDD">CDD</mat-option>
            <mat-option value="INTERIM">Intérim</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Rôle métier</mat-label>
          <mat-select name="role_code" [(ngModel)]="model.role_code" required>
            <mat-option value="FOREUR">Foreur</mat-option>
            <mat-option value="CHAUFFEUR">Chauffeur</mat-option>
            <mat-option value="PELLISTE">Pelliste</mat-option>
            <mat-option value="CHEF_POSTE">Chef de poste</mat-option>
            <mat-option value="TECHNICIEN">Technicien</mat-option>
            <mat-option value="AGENT_HSE">Agent HSE</mat-option>
          </mat-select>
        </mat-form-field>
      </div>

      <div class="form-row">
        <mat-form-field>
          <mat-label>Date d'embauche</mat-label>
          <input matInput type="date" name="hired_date" [(ngModel)]="model.hired_date" />
        </mat-form-field>
      </div>

      <button mat-raised-button color="primary" type="submit">
        Enregistrer
      </button>
    </form>

    <!-- Habilitations sub-section -->
    <section class="habilitations">
      <div class="section-header">
        <h3>Habilitations</h3>
        <button mat-button color="primary" (click)="openAddCertDialog()">+ Ajouter</button>
      </div>

      @if (certifications().length === 0) {
        <p class="empty-hint">Aucune habilitation enregistrée.</p>
      }

      @for (cert of certifications(); track cert.id) {
        <div class="cert-row">
          <span class="cert-code">{{ cert.cert_code }}</span>
          <span class="cert-label">{{ cert.cert_label }}</span>
          <span class="cert-dates">
            {{ cert.valid_from }} → {{ cert.valid_to }}
          </span>
          <span
            class="cert-badge"
            [style.color]="statusColor(cert.status ?? computeStatus(cert))"
            [matTooltip]="statusLabel(cert.status ?? computeStatus(cert))"
          >
            {{ cert.status ?? computeStatus(cert) }}
          </span>
        </div>
      }
    </section>
  `,
  styles: [`
    .form-row { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 8px; }
    mat-form-field { flex: 1; min-width: 200px; }
    .habilitations { margin-top: 24px; }
    .section-header { display: flex; align-items: center; justify-content: space-between; }
    .cert-row { display: flex; gap: 16px; align-items: center; padding: 8px 0; border-bottom: 1px solid #eee; }
    .cert-code { font-weight: bold; min-width: 200px; }
    .cert-label { flex: 1; }
    .cert-dates { color: #666; font-size: 0.85rem; }
    .cert-badge { font-size: 0.75rem; font-weight: bold; text-transform: uppercase; }
    .empty-hint { color: #888; font-style: italic; }
  `],
})
export class EmployeeFormComponent implements OnInit {
  private readonly api = inject(RhApiService);
  private readonly snack = inject(MatSnackBar);

  readonly certifications = signal<CertificationRow[]>([]);

  model: Partial<EmployeeRow> = {
    contract_type: 'CDI',
    is_active: true,
  };

  ngOnInit(): void {
    // Certifications are loaded when editing an existing employee
    // For new employee, certifications start empty
  }

  computeStatus(cert: CertificationRow): CertStatus {
    return computeCertStatus(cert);
  }

  statusColor(status: CertStatus): string {
    return STATUS_COLOR[status];
  }

  statusLabel(status: CertStatus): string {
    const labels: Record<CertStatus, string> = {
      VALID: 'Habilitation valide',
      EXPIRING_SOON: `Expire dans moins de ${EXPIRING_SOON_DAYS} jours`,
      EXPIRED: 'Habilitation expirée',
    };
    return labels[status];
  }

  onSubmit(): void {
    this.snack.open('Employé enregistré (fonctionnalité à câbler avec les routes)', 'OK', {
      duration: 3000,
    });
  }

  openAddCertDialog(): void {
    // Dialog opens a form for certification_type_id, valid_from, valid_to,
    // certificate_number, optional document_sha256 (S3 pre-signed upload)
    this.snack.open('Formulaire habilitation — à câbler avec MatDialog', 'OK', {
      duration: 3000,
    });
  }
}
