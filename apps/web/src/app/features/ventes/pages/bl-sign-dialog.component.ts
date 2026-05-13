import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { BonDeLivraison, VentesApiService } from '../services/ventes-api.service';

export interface BlSignDialogData {
  bl: BonDeLivraison;
}

const SHA256_RE = /^[0-9a-f]{64}$/i;

/** Compute SHA-256 of text via Web Crypto — same pattern as stockpile-adjustment */
async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * BlSignDialogComponent (VTE-03).
 *
 * Permet de signer un BL en saisissant ou en calculant les SHA-256
 * de la signature client et chauffeur.
 *
 * Deux modes par champ :
 *   - Coller directement un hash SHA-256 (64 hex)
 *   - Saisir un texte libre → bouton "Calculer hash" → hash affiché
 */
@Component({
  selector: 'gravel-bl-sign-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Signer le BL {{ data.bl.number }}</h2>

    <mat-dialog-content>
      <p class="bl-info">
        <strong>Calibre :</strong> {{ data.bl.calibreCode }} &nbsp;|&nbsp;
        <strong>Tonnage :</strong> {{ data.bl.tonnageKg }} kg &nbsp;|&nbsp;
        <strong>Date :</strong> {{ data.bl.deliveryDate }}
      </p>

      <!-- Signature client -->
      <fieldset class="sig-field">
        <legend>Signature client</legend>
        <mat-form-field appearance="outline" style="width:100%">
          <mat-label>Texte ou hash SHA-256 (64 hex)</mat-label>
          <textarea matInput rows="2" [(ngModel)]="clientRaw" placeholder="Coller hash ou saisir texte..."></textarea>
        </mat-form-field>
        <div class="hash-row">
          <button mat-stroked-button type="button" (click)="computeClient()" [disabled]="!clientRaw()">
            Calculer hash
          </button>
          <code class="hash-preview" *ngIf="clientHash()">{{ clientHash() }}</code>
          <span class="valid-badge" *ngIf="isValidHash(clientHash())">✓</span>
          <span class="invalid-badge" *ngIf="clientHash() && !isValidHash(clientHash())">Format invalide</span>
        </div>
      </fieldset>

      <!-- Signature chauffeur -->
      <fieldset class="sig-field">
        <legend>Signature chauffeur</legend>
        <mat-form-field appearance="outline" style="width:100%">
          <mat-label>Texte ou hash SHA-256 (64 hex)</mat-label>
          <textarea matInput rows="2" [(ngModel)]="driverRaw" placeholder="Coller hash ou saisir texte..."></textarea>
        </mat-form-field>
        <div class="hash-row">
          <button mat-stroked-button type="button" (click)="computeDriver()" [disabled]="!driverRaw()">
            Calculer hash
          </button>
          <code class="hash-preview" *ngIf="driverHash()">{{ driverHash() }}</code>
          <span class="valid-badge" *ngIf="isValidHash(driverHash())">✓</span>
          <span class="invalid-badge" *ngIf="driverHash() && !isValidHash(driverHash())">Format invalide</span>
        </div>
      </fieldset>

      <!-- Pays destination (export) -->
      <mat-form-field appearance="outline" style="width:100%; margin-top:8px">
        <mat-label>Pays de destination (export uniquement)</mat-label>
        <input matInput [(ngModel)]="destinationCountry" placeholder="FR, CI, BF…" />
      </mat-form-field>

      <p class="warning" *ngIf="signed()">
        ✅ BL signé — le stockpile a été mis à jour.
      </p>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="null">Annuler</button>
      <button
        mat-raised-button color="primary"
        [disabled]="!canSign() || saving()"
        (click)="sign()"
      >
        <mat-spinner *ngIf="saving()" diameter="18" style="display:inline-block;margin-right:6px"></mat-spinner>
        Signer le BL
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .bl-info { font-size: 13px; color: #555; margin-bottom: 16px; }
    .sig-field { border: 1px solid #e0e0e0; border-radius: 4px; padding: 12px; margin-bottom: 12px; }
    legend { font-size: 12px; font-weight: 600; color: #333; padding: 0 4px; }
    .hash-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
    .hash-preview { font-size: 11px; color: #1565C0; word-break: break-all; }
    .valid-badge { color: #2E7D32; font-weight: 700; }
    .invalid-badge { color: #C62828; font-size: 12px; }
    .warning { color: #2E7D32; font-weight: 600; }
  `],
})
export class BlSignDialogComponent {
  private readonly api = inject(VentesApiService);
  private readonly snack = inject(MatSnackBar);

  readonly clientRaw = signal('');
  readonly driverRaw = signal('');
  readonly clientHash = signal('');
  readonly driverHash = signal('');
  readonly destinationCountry = signal('');
  readonly saving = signal(false);
  readonly signed = signal(false);

  constructor(
    public readonly dialogRef: MatDialogRef<BlSignDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public readonly data: BlSignDialogData,
  ) {}

  async computeClient(): Promise<void> {
    const raw = this.clientRaw();
    const hash = SHA256_RE.test(raw) ? raw.toLowerCase() : await sha256(raw);
    this.clientHash.set(hash);
  }

  async computeDriver(): Promise<void> {
    const raw = this.driverRaw();
    const hash = SHA256_RE.test(raw) ? raw.toLowerCase() : await sha256(raw);
    this.driverHash.set(hash);
  }

  isValidHash(h: string): boolean {
    return SHA256_RE.test(h);
  }

  canSign(): boolean {
    return this.isValidHash(this.clientHash()) && this.isValidHash(this.driverHash());
  }

  sign(): void {
    if (!this.canSign()) return;
    this.saving.set(true);

    this.api
      .signBL(this.data.bl.id, {
        clientSignatureSha256: this.clientHash(),
        driverSignatureSha256: this.driverHash(),
        destinationCountry: this.destinationCountry() || undefined,
      })
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.signed.set(true);
          this.snack.open(`BL ${updated.number} signé ✓`, 'OK', { duration: 4000 });
          this.dialogRef.close(updated);
        },
        error: (err: Error) => {
          this.saving.set(false);
          this.snack.open(`Erreur : ${err.message}`, 'OK', { duration: 6000 });
        },
      });
  }
}
