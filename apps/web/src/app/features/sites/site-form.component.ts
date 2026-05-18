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

interface CountryOption {
  id: string;
  isoAlpha2: string;
  name: string;
  defaultCurrency: string;
  defaultTimezone: string;
}

const SITE_PAYLOAD_KEYS = [
  'code',
  'name',
  'countryId',
  'ianaTimezone',
  'functionalCurrency',
  'gpsPoint',
  'managerUserId',
  'capacityTPerDay',
] as const;

type SitePayload = Pick<SiteResponse, (typeof SITE_PAYLOAD_KEYS)[number]>;

function pickSitePayload(value: Record<string, unknown>): Partial<SitePayload> {
  const out: Record<string, unknown> = {};
  for (const key of SITE_PAYLOAD_KEYS) {
    if (value[key] !== undefined) out[key] = value[key];
  }
  return out as Partial<SitePayload>;
}

/**
 * Static fallback for the country dropdown. Used only when /api/countries
 * is unavailable so the form stays usable in degraded mode. The `id` values
 * are NOT real database UUIDs — submission will fail until the backend
 * countries table is seeded by migration 1721100000000.
 */
const FALLBACK_COUNTRIES: ReadonlyArray<{ id: string; iso: string; name: string }> = [
  { id: 'fallback-ci', iso: 'CI', name: "Côte d'Ivoire" },
  { id: 'fallback-bf', iso: 'BF', name: 'Burkina Faso' },
  { id: 'fallback-ml', iso: 'ML', name: 'Mali' },
  { id: 'fallback-sn', iso: 'SN', name: 'Sénégal' },
  { id: 'fallback-gh', iso: 'GH', name: 'Ghana' },
  { id: 'fallback-tg', iso: 'TG', name: 'Togo' },
  { id: 'fallback-bj', iso: 'BJ', name: 'Bénin' },
  { id: 'fallback-ne', iso: 'NE', name: 'Niger' },
  { id: 'fallback-fr', iso: 'FR', name: 'France' },
];

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

    // Load reference data in parallel. Each Promise is wrapped so one
    // failure doesn't block the others — empty countries shouldn't prevent
    // the manager dropdown from loading and vice-versa.
    await Promise.all([this.loadCountries(), this.loadManagers()]);

    if (idParam !== 'new') {
      const existing = await firstValueFrom(this.http.get<SiteResponse>(`/api/sites/${idParam}`));
      // Strip server-only fields from the model so the form does not send
      // them back on PATCH (whitelist DTO rejects `status`, `tenantId`, etc.).
      this.model.set(pickSitePayload(existing as unknown as Record<string, unknown>));
    }
  }

  /** Country dropdown source. If /api/countries is unavailable (endpoint
   *  not yet deployed, table empty for the tenant), fall back to a static
   *  list so the operator can still submit the form. The free-text country
   *  IDs map to ISO-alpha2 codes the backend can resolve. */
  private async loadCountries(): Promise<void> {
    const countryField = this.fields.find((f) => f.key === 'countryId');
    if (!countryField?.props) return;
    try {
      const countries = await firstValueFrom(
        this.http.get<CountryOption[]>('/api/countries'),
      );
      if (Array.isArray(countries) && countries.length > 0) {
        countryField.props.options = countries.map((c) => ({
          label: `${c.name} (${c.isoAlpha2})`,
          value: c.id,
        }));
        return;
      }
    } catch (err: unknown) {
      console.error('[SiteForm] countries load failed', err);
    }
    countryField.props.options = FALLBACK_COUNTRIES.map((c) => ({
      label: `${c.name} (${c.iso})`,
      value: c.id,
    }));
    // Surface the fallback state so the operator knows it's a stand-in.
    countryField.props.description =
      'Liste de secours (API /api/countries indisponible).';
  }

  /** Site manager dropdown source. Optional field — failure should silently
   *  leave the dropdown empty rather than block the form. */
  private async loadManagers(): Promise<void> {
    const managerField = this.fields.find((f) => f.key === 'managerUserId');
    if (!managerField?.props) return;
    try {
      const users = await firstValueFrom(
        this.http.get<Array<{ id: string; displayName?: string; email?: string }>>(
          '/api/users',
        ),
      );
      managerField.props.options = (Array.isArray(users) ? users : []).map((u) => ({
        label: u.displayName ?? u.email ?? u.id,
        value: u.id,
      }));
    } catch (err: unknown) {
      console.error('[SiteForm] users load failed', err);
      managerField.props.options = [];
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.submitting.set(true);
    try {
      const id = this.id();
      // Whitelist payload to known DTO fields. Formly may surface keys from
      // the model that don't belong in the create/update DTO; sending them
      // triggers a 400 from the backend's `forbidNonWhitelisted` pipe.
      const payload = pickSitePayload(this.form.value as Record<string, unknown>);
      const saved =
        id === 'new'
          ? await firstValueFrom(this.http.post<SiteResponse>('/api/sites', payload))
          : await firstValueFrom(this.http.patch<SiteResponse>(`/api/sites/${id}`, payload));
      this.snack.open('Site enregistré', 'OK', { duration: 3000 });
      await this.router.navigate(['/sites', saved.id]);
    } catch (err: unknown) {
      console.error('[SiteForm] submit failed', err);
      const msg = this.extractErrorMessage(err);
      this.snack.open(`Erreur : ${msg}`, 'OK', { duration: 6000 });
    } finally {
      this.submitting.set(false);
    }
  }

  private extractErrorMessage(err: unknown): string {
    if (typeof err === 'object' && err !== null) {
      const e = err as { error?: { message?: string | string[] }; message?: string };
      const m = e.error?.message ?? e.message;
      if (Array.isArray(m)) return m.join(', ');
      if (typeof m === 'string') return m;
    }
    return 'erreur inconnue';
  }

  async onArchive(): Promise<void> {
    const id = this.id();
    if (id === 'new') return;
    if (!window.confirm('sites.form.confirmArchive')) return;
    await firstValueFrom(this.http.patch(`/api/sites/${id}/archive`, {}));
    await this.router.navigate(['/sites']);
  }
}
