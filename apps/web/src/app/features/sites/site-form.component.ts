import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FormlyModule } from '@ngx-formly/core';
import { FormlyMaterialModule } from '@ngx-formly/material';
import { firstValueFrom } from 'rxjs';
import { siteFormSchema } from './site-form.schema';

interface SiteResponse {
  id: string;
  code: string;
  name: string;
  countryId: string;
  ianaTimezone: string;
  functionalCurrency: string;
  gpsPoint: { type: 'Point'; coordinates: [number, number] };
  managerUserId: string | null;
  capacityTPerDay: number | null;
  status: string;
}

/**
 * Site create/edit form built on Formly. New sites use the `new` route;
 * existing sites pre-load via GET /api/sites/:id. Submit performs POST or
 * PATCH, then routes to the detail page.
 *
 * Soft-delete: the archive button (visible to DIRECTION_GROUPE +
 * DIRECTEUR_SITE only — gated server-side via @Role and verified by E2E)
 * performs PATCH /api/sites/:id/archive.
 */
@Component({
  selector: 'gravel-site-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslocoModule,
    MatButtonModule,
    FormlyModule,
    FormlyMaterialModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form
      [formGroup]="form"
      (ngSubmit)="onSubmit()"
      data-testid="site-form"
      class="site-form"
    >
      <h1>{{ (id() === 'new' ? 'sites.form.titleNew' : 'sites.form.titleEdit') | transloco }}</h1>

      <formly-form [form]="form" [fields]="fields" [model]="model()"></formly-form>

      <div class="actions">
        <button
          mat-flat-button
          color="primary"
          type="submit"
          [disabled]="form.invalid || submitting()"
          data-testid="site-submit"
        >
          {{ 'sites.form.submit' | transloco }}
        </button>

        <button
          *ngIf="id() !== 'new'"
          mat-stroked-button
          color="warn"
          type="button"
          (click)="onArchive()"
          data-testid="site-archive"
        >
          {{ 'sites.form.archive' | transloco }}
        </button>
      </div>
    </form>
  `,
  styles: [
    `
      .site-form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        max-width: 720px;
      }
      .actions {
        display: flex;
        gap: 0.75rem;
      }
    `,
  ],
})
export class SiteFormComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  readonly form = new FormGroup({});
  readonly fields = siteFormSchema;
  readonly model = signal<Partial<SiteResponse>>({});
  readonly id = signal<string>('new');
  readonly submitting = signal(false);

  async ngOnInit(): Promise<void> {
    const idParam = this.route.snapshot.paramMap.get('id') ?? 'new';
    this.id.set(idParam);
    if (idParam !== 'new') {
      const existing = await firstValueFrom(this.http.get<SiteResponse>(`/api/sites/${idParam}`));
      this.model.set(existing);
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.submitting.set(true);
    try {
      const id = this.id();
      const payload = this.form.value;
      const saved =
        id === 'new'
          ? await firstValueFrom(this.http.post<SiteResponse>('/api/sites', payload))
          : await firstValueFrom(this.http.patch<SiteResponse>(`/api/sites/${id}`, payload));
      this.snack.open('sites.form.saved', 'OK', { duration: 3000 });
      await this.router.navigate(['/sites', saved.id]);
    } catch (err: unknown) {
      // eslint-disable-next-line no-console
      console.error('[SiteForm] submit failed', err);
      this.snack.open('sites.form.error', 'OK', { duration: 5000 });
    } finally {
      this.submitting.set(false);
    }
  }

  async onArchive(): Promise<void> {
    const id = this.id();
    if (id === 'new') return;
    if (!window.confirm('sites.form.confirmArchive')) return;
    await firstValueFrom(this.http.patch(`/api/sites/${id}/archive`, {}));
    await this.router.navigate(['/sites']);
  }
}
