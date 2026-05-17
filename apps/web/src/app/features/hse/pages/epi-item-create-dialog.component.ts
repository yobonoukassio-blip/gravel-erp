import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {
  EpiCategory,
  HseApiService,
} from '../services/hse-api.service';

const CATEGORIES: { value: EpiCategory; label: string }[] = [
  { value: 'casque', label: 'Casque' },
  { value: 'gilet', label: 'Gilet HV' },
  { value: 'chaussures', label: 'Chaussures' },
  { value: 'gants', label: 'Gants' },
  { value: 'masque', label: 'Masque' },
  { value: 'lunettes', label: 'Lunettes' },
  { value: 'harnais', label: 'Harnais' },
  { value: 'bouchons', label: 'Bouchons' },
  { value: 'autre', label: 'Autre' },
];

/**
 * EpiItemCreateDialog — HSE-03 catalog row creation. Returns the created
 * item or null on cancel.
 */
@Component({
  selector: 'gravel-epi-item-create-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Ajouter un EPI</h2>
    <mat-dialog-content class="form">
      <mat-form-field appearance="outline">
        <mat-label>Désignation</mat-label>
        <input matInput [(ngModel)]="name" name="name" required />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Catégorie</mat-label>
        <mat-select [(ngModel)]="category" name="category" required>
          @for (c of categories; track c.value) {
            <mat-option [value]="c.value">{{ c.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Description</mat-label>
        <textarea
          matInput
          [(ngModel)]="description"
          name="description"
          rows="2"
        ></textarea>
      </mat-form-field>

      <mat-checkbox [(ngModel)]="isMandatory" name="isMandatory">
        Obligatoire pour tous les employés terrain
      </mat-checkbox>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()">Annuler</button>
      <button
        mat-flat-button
        color="primary"
        [disabled]="saving() || !canSave()"
        (click)="save()"
      >
        {{ saving() ? 'Enregistrement…' : 'Enregistrer' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .form {
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-width: 380px;
        padding-top: 8px;
      }
    `,
  ],
})
export class EpiItemCreateDialogComponent {
  private readonly api = inject(HseApiService);
  private readonly ref =
    inject<MatDialogRef<EpiItemCreateDialogComponent>>(MatDialogRef);

  readonly categories = CATEGORIES;
  readonly saving = signal(false);

  name = '';
  category: EpiCategory = 'casque';
  description = '';
  isMandatory = false;

  canSave(): boolean {
    return this.name.trim().length > 0;
  }

  cancel(): void {
    this.ref.close(null);
  }

  save(): void {
    if (!this.canSave()) return;
    this.saving.set(true);
    this.api
      .createEpiItem({
        name: this.name,
        category: this.category,
        description: this.description.trim() || null,
        isMandatory: this.isMandatory,
      })
      .subscribe({
        next: (row) => this.ref.close(row),
        error: () => this.saving.set(false),
      });
  }
}
