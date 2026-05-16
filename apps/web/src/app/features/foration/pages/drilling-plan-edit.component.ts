import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FormlyModule, FormlyFieldConfig } from '@ngx-formly/core';
import { FormlyMaterialModule } from '@ngx-formly/material';
import { firstValueFrom, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ForationApiService, CreateDrillingPlanDto, DrillingPlan } from '../services/foration-api.service';

interface ZoneRow { id: string; code: string; name: string; siteId?: string; site_id?: string; }
interface BenchRow { id: string; code: string; name: string; productionZoneId?: string; production_zone_id?: string; }
interface EmployeeRow { id: string; first_name: string; last_name: string; role_code: string; is_active: boolean; }
interface EquipmentRow { id: string; code: string; label: string; type?: string; status: string; }

/**
 * Drilling plan create/edit form. Uses Formly schema with selects backed
 * by /api/zones, /api/benches, /api/rh/employees, /api/equipment.
 *
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
        <formly-form [form]="form" [fields]="fields()" [model]="model"></formly-form>
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
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  readonly form = new FormGroup({});
  readonly saving = signal(false);
  readonly plan = signal<DrillingPlan | null>(null);
  model: Partial<CreateDrillingPlanDto> = {};

  // Resolved at ngOnInit from the user's first siteId via /api/users/me.
  private siteId = '';

  // Reactive options arrays — Formly re-renders when these change.
  private readonly zoneOptions = signal<{ label: string; value: string }[]>([]);
  private readonly benchOptions = signal<{ label: string; value: string }[]>([]);
  private readonly operatorOptions = signal<{ label: string; value: string }[]>([]);
  private readonly machineOptions = signal<{ label: string; value: string }[]>([]);

  readonly fields = (): FormlyFieldConfig[] => [
    {
      key: 'zone_id',
      type: 'select',
      props: {
        label: 'Zone de production',
        required: true,
        options: this.zoneOptions(),
      },
    },
    {
      key: 'bench_id',
      type: 'select',
      props: {
        label: 'Banc',
        required: true,
        options: this.benchOptions(),
      },
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
      type: 'select',
      props: {
        label: 'Opérateur assigné',
        options: this.operatorOptions(),
      },
    },
    {
      key: 'assigned_machine_id',
      type: 'select',
      props: {
        label: 'Machine assignée',
        description: 'La machine doit être en statut actif pour activer le plan',
        options: this.machineOptions(),
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

  async ngOnInit(): Promise<void> {
    // Resolve site context
    const me = await firstValueFrom(
      this.http.get<{ siteIds: string[] }>('/api/users/me').pipe(
        catchError(() => of({ siteIds: [] as string[] })),
      ),
    );
    this.siteId = me.siteIds[0] ?? '';

    await this.loadDropdowns();

    // If editing an existing plan, load it
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.api.getPlan(id).subscribe((p) => {
        this.plan.set(p);
        this.model = { ...p };
      });
    }
  }

  private async loadDropdowns(): Promise<void> {
    const httpParams = this.siteId ? { params: { site_id: this.siteId } } : {};

    const [zones, benches, employees, equipment] = await Promise.all([
      firstValueFrom(
        this.http
          .get<ZoneRow[] | { data: ZoneRow[] }>('/api/zones', httpParams)
          .pipe(
            map((r) => (Array.isArray(r) ? r : r.data ?? [])),
            catchError(() => of([] as ZoneRow[])),
          ),
      ),
      firstValueFrom(
        this.http
          .get<BenchRow[]>('/api/benches', httpParams)
          .pipe(catchError(() => of([] as BenchRow[]))),
      ),
      firstValueFrom(
        this.http
          .get<EmployeeRow[]>('/api/rh/employees', {
            params: this.siteId ? { site_id: this.siteId } : {},
          })
          .pipe(catchError(() => of([] as EmployeeRow[]))),
      ),
      firstValueFrom(
        this.http
          .get<EquipmentRow[]>('/api/equipment', httpParams)
          .pipe(catchError(() => of([] as EquipmentRow[]))),
      ),
    ]);

    this.zoneOptions.set(
      zones.map((z: ZoneRow) => ({ label: `${z.code} — ${z.name}`, value: z.id })),
    );
    this.benchOptions.set(
      benches.map((b: BenchRow) => ({ label: `${b.code} — ${b.name}`, value: b.id })),
    );
    this.operatorOptions.set(
      employees
        .filter((e: EmployeeRow) => e.is_active)
        .map((e: EmployeeRow) => ({
          label: `${e.first_name} ${e.last_name}${e.role_code ? ` — ${e.role_code}` : ''}`,
          value: e.id,
        })),
    );
    this.machineOptions.set(
      equipment.map((eq: EquipmentRow) => ({
        label: `${eq.code} — ${eq.label}${eq.status === 'active' ? '' : ` (${eq.status})`}`,
        value: eq.id,
      })),
    );
  }

  async onSubmit(): Promise<void> {
    if (!this.siteId) {
      this.snack.open('Site introuvable. Reconnectez-vous.', 'OK', { duration: 5000 });
      return;
    }
    this.saving.set(true);
    try {
      const existing = this.plan();
      const dto: CreateDrillingPlanDto = {
        ...(this.model as CreateDrillingPlanDto),
        site_id: this.siteId,
      };
      const result = existing
        ? await firstValueFrom(this.api.updatePlan(existing.id, dto))
        : await firstValueFrom(this.api.createPlan(dto));
      this.plan.set(result);
      this.snack.open('Plan enregistré.', 'OK', { duration: 3000 });
      void this.router.navigate(['..', result.id], { relativeTo: this.route });
    } catch (err: unknown) {
      const error = err as { error?: { message?: string }; message?: string };
      this.snack.open(
        `Erreur : ${error.error?.message ?? error.message ?? 'inconnue'}`,
        'OK',
        { duration: 6000 },
      );
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
      this.snack.open('Plan activé.', 'OK', { duration: 3000 });
    } catch (err: unknown) {
      const error = err as { error?: { code?: string; message?: string }; message?: string };
      const code = error.error?.code;
      if (code === 'EQUIPMENT_NOT_ACTIVE') {
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
