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

const PERMIT_TYPES = ['exploration', 'exploitation', 'environnemental', 'explosifs'];

export const permitFormSchema: FormlyFieldConfig[] = [
  {
    key: 'type',
    type: 'select',
    props: {
      label: 'permits.fields.type',
      required: true,
      options: PERMIT_TYPES.map((t) => ({ label: t, value: t })),
      attributes: { 'data-testid': 'permit-type-select' },
    },
  },
  {
    key: 'authority',
    type: 'input',
    props: {
      label: 'permits.fields.authority',
      required: true,
      attributes: { 'data-testid': 'permit-authority-input' },
    },
  },
  {
    key: 'reference',
    type: 'input',
    props: {
      label: 'permits.fields.reference',
      required: true,
      attributes: { 'data-testid': 'permit-reference-input' },
    },
  },
  {
    key: 'validFrom',
    type: 'input',
    props: {
      label: 'permits.fields.validFrom',
      type: 'date',
      required: true,
      attributes: { 'data-testid': 'permit-valid-from-input' },
    },
  },
  {
    key: 'validTo',
    type: 'input',
    props: {
      label: 'permits.fields.validTo',
      type: 'date',
      required: true,
      attributes: { 'data-testid': 'permit-valid-to-input' },
    },
  },
];

/**
 * Permit creation form with optional file upload. The upload flow is:
 *   1. Client computes SHA-256 of the file (browser SubtleCrypto).
 *   2. POST /api/attachments {sha256, size, mime} → presigned PUT URL.
 *   3. PUT the file bytes to the presigned URL (content-addressed S3 key).
 *   4. POST /api/permits with `documentUrl = <objectKey>`.
 */
@Component({
  selector: 'gravel-permit-form',
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
      data-testid="permit-form"
      class="permit-form"
    >
      <h1>{{ 'permits.form.titleNew' | transloco }}</h1>

      <formly-form [form]="form" [fields]="fields" [model]="model()"></formly-form>

      <label class="file-row">
        <span>{{ 'permits.form.document' | transloco }}</span>
        <input
          type="file"
          accept="application/pdf"
          data-testid="permit-document-input"
          (change)="onFileChosen($event)"
        />
      </label>
      <p *ngIf="documentUrl()" data-testid="permit-document-objectkey">
        {{ documentUrl() }}
      </p>

      <button
        mat-flat-button
        color="primary"
        type="submit"
        [disabled]="form.invalid || submitting()"
        data-testid="permit-submit"
      >
        {{ 'permits.form.submit' | transloco }}
      </button>
    </form>
  `,
  styles: [
    `
      .permit-form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        max-width: 720px;
      }
      .file-row {
        display: flex;
        gap: 0.75rem;
        align-items: center;
      }
    `,
  ],
})
export class PermitFormComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly form = new FormGroup({});
  readonly fields = permitFormSchema;
  readonly model = signal<Record<string, unknown>>({});
  readonly submitting = signal(false);
  readonly documentUrl = signal<string | null>(null);
  private siteId = '';

  ngOnInit(): void {
    this.siteId = this.route.snapshot.paramMap.get('siteId') ?? '';
  }

  async onFileChosen(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    const sha256 = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const presign = await firstValueFrom(
      this.http.post<{ uploadUrl: string; objectKey: string }>('/api/attachments', {
        sha256,
        size: file.size,
        mime: file.type || 'application/pdf',
      }),
    );
    this.documentUrl.set(presign.objectKey);
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.submitting.set(true);
    try {
      await firstValueFrom(
        this.http.post('/api/permits', {
          siteId: this.siteId,
          ...this.form.value,
          documentUrl: this.documentUrl(),
        }),
      );
      await this.router.navigate(['/sites', this.siteId]);
    } finally {
      this.submitting.set(false);
    }
  }
}
