import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FormlyModule, FormlyFieldConfig } from '@ngx-formly/core';
import { FormlyMaterialModule } from '@ngx-formly/material';
import { firstValueFrom } from 'rxjs';
import { ForationApiService, CreateDrillingPlanDto, DrillingPlan } from '../services/foration-api.service';

/**
 * Drilling plan create/edit form. Uses Formly schema.
 * Activate button calls POST /:id/activate; backend rejects if machine
 * status != 'active' (FOR-05).
 */
@Component({
  selector: 'gravel-drilling-plan-edit',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    FormlyModule,
    FormlyMaterialModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="plan-edit">
      <h1>Plan de foration</h1>
      <form [formGroup]="form" (ngSubmit)="onSubmit()">
        <formly-form [form]="form" [fields]="fields" [model]="model"></formly-form>
        <div class="actions">
          <button mat-flat-button color="primary" type="submit" [disabled]="saving()">
            Enregistrer
          </button>
          @if (plan(); as p) {
            @if (p.status === 'draft') {
              <button mat-stroked-button type="button" (click)="activate()">
                Activer le plan
              </button>
            }
            @if (p.status === 'active') {
              <button mat-stroked-button type="button" (click)="close()">
                Clôturer le plan
              </button>
            }
          }
          <a mat-button routerLink="..">Annuler</a>
        </div>
      </form>
    </div>
  `,
})
export class DrillingPlanEditComponent implements OnInit {
  private readonly api = inject(ForationApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  readonly form = new FormGroup({});
  readonly saving = signal(false);
  readonly plan = signal<DrillingPlan | null>(null);
  model: Partial<CreateDrillingPlanDto> = {};

  readonly fields: FormlyFieldConfig[] = [
    {
      key: 'zone_id',
      type: 'input',
      props: { label: 'Zone de production', required: true },
    },
    {
      key: 'bench_id',
      type: 'input',
      props: { label: 'Banc', required: true },
    },
    {
      key: 'planned_hole_count',
      type: 'input',
      props: { label: 'Nombre de trous prévus', type: 'number', required: true, min: 1 },
    },
    {
      key: 'target_depth_m',
      type: 'input',
      props: { label: 'Profondeur cible (m)', type: 'number', required: true, step: 0.1 },
    },
    {
      key: 'diameter_mm',
      type: 'input',
      props: { label: 'Diamètre (mm)', type: 'number', required: true, min: 1 },
    },
    {
      key: 'assigned_operator_id',
      type: 'input',
      props: { label: 'Opérateur assigné' },
    },
    {
      key: 'assigned_machine_id',
      type: 'input',
      props: {
        label: 'Machine assignée',
        description: 'La machine doit être en statut actif pour activer le plan',
      },
    },
    {
      key: 'valid_from',
      type: 'input',
      props: { label: 'Valide à partir du', type: 'datetime-local', required: true },
    },
    {
      key: 'valid_to',
      type: 'input',
      props: { label: 'Valide jusqu’au', type: 'datetime-local' },
    },
  ];

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.api.getPlan(id).subscribe((p) => {
        this.plan.set(p);
        this.model = { ...p };
      });
    }
  }

  async onSubmit(): Promise<void> {
    this.saving.set(true);
    try {
      const existing = this.plan();
      const dto = this.model as CreateDrillingPlanDto;
      const result = existing
        ? await firstValueFrom(this.api.updatePlan(existing.id, dto))
        : await firstValueFrom(this.api.createPlan(dto));
      this.plan.set(result);
      this.snack.open('Saved', 'OK', { duration: 3000 });
      void this.router.navigate(['..', result.id], { relativeTo: this.route });
    } catch (err) {
      this.snack.open(`Error: ${(err as Error).message}`, 'OK', { duration: 5000 });
    } finally {
      this.saving.set(false);
    }
  }

  async activate(): Promise<void> {
    const p = this.plan();
    if (!p) return;
    try {
      const result = await firstValueFrom(this.api.activate(p.id));
      this.plan.set(result);
      this.snack.open('Plan activé', 'OK', { duration: 3000 });
    } catch (err: unknown) {
      const error = err as { error?: { code?: string; message?: string }; message?: string };
      const code = error.error?.code;
      if (code === 'EQUIPMENT_NOT_ACTIVE') {
        // FOR-05: machine en panne ou non disponible.
        this.snack.open('Plan non activé : la machine assignée n’est pas en statut actif.', 'OK', { duration: 6000 });
      } else {
        this.snack.open(error.error?.message ?? error.message ?? 'Erreur', 'OK', { duration: 5000 });
      }
    }
  }

  async close(): Promise<void> {
    const p = this.plan();
    if (!p) return;
    const result = await firstValueFrom(this.api.close(p.id));
    this.plan.set(result);
  }
}
