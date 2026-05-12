import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslocoModule } from '@jsverse/transloco';
import { MatButtonModule } from '@angular/material/button';
import { FormlyModule, type FormlyFieldConfig } from '@ngx-formly/core';
import { FormlyMaterialModule } from '@ngx-formly/material';
import { firstValueFrom } from 'rxjs';

export const zoneFormSchema: FormlyFieldConfig[] = [
  {
    key: 'code',
    type: 'input',
    props: {
      label: 'zones.fields.code',
      required: true,
      pattern: '^[a-zA-Z0-9-_]{1,30}$',
      attributes: { 'data-testid': 'zone-code-input' },
    },
  },
  {
    key: 'name',
    type: 'input',
    props: {
      label: 'zones.fields.name',
      required: true,
      attributes: { 'data-testid': 'zone-name-input' },
    },
  },
  {
    key: 'geometry',
    type: 'polygon-picker-leaflet',
    props: { label: 'zones.fields.boundary', required: true },
  },
];

@Component({
  selector: 'gravel-zone-form',
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
    <form [formGroup]="form" (ngSubmit)="onSubmit()" data-testid="zone-form" class="zone-form">
      <h1>{{ 'zones.form.titleNew' | transloco }}</h1>

      <formly-form [form]="form" [fields]="fields" [model]="model()"></formly-form>

      <button
        mat-flat-button
        color="primary"
        type="submit"
        [disabled]="form.invalid || submitting()"
        data-testid="zone-submit"
      >
        {{ 'zones.form.submit' | transloco }}
      </button>
    </form>
  `,
  styles: [
    `
      .zone-form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        max-width: 720px;
      }
    `,
  ],
})
export class ZoneFormComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly form = new FormGroup({});
  readonly fields = zoneFormSchema;
  readonly model = signal<Record<string, unknown>>({});
  readonly submitting = signal(false);
  private siteId = '';

  ngOnInit(): void {
    this.siteId = this.route.snapshot.paramMap.get('siteId') ?? '';
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.submitting.set(true);
    try {
      await firstValueFrom(
        this.http.post('/api/zones', { siteId: this.siteId, ...this.form.value }),
      );
      await this.router.navigate(['/sites', this.siteId]);
    } finally {
      this.submitting.set(false);
    }
  }
}
