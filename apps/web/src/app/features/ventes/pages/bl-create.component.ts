import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatIconModule } from '@angular/material/icon';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import {
  Customer,
  SaleContract,
  VentesApiService,
} from '../services/ventes-api.service';

interface SiteOption {
  id: string;
  code: string;
  name: string;
}

interface StockpileOption {
  id: string;
  code: string;
  label?: string;
  siteId: string;
  calibreCode: string;
}

/**
 * VTE-03 — Nouveau BL form.
 *
 * Sequential flow: select site → customer → contract (filtered by customer)
 * → stockpile (filtered by site + calibre). Tonnage in kg, delivery date,
 * generated BL number. Submit performs POST /api/ventes/bl then routes back
 * to the BL list. The created BL starts in `draft` status; signature is a
 * separate action from the list view.
 */
@Component({
  selector: 'gravel-bl-create',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideNativeDateAdapter(),
    { provide: MAT_DATE_LOCALE, useValue: 'fr-FR' },
  ],
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatIconModule,
  ],
  template: `
    <div class="bl-create">
      <header class="page-header">
        <h1>Nouveau bon de livraison</h1>
        <a mat-stroked-button routerLink="/ventes/bl">
          <mat-icon>arrow_back</mat-icon>
          <span>Retour</span>
        </a>
      </header>

      <form class="bl-form" (submit)="onSubmit($event)">
        <mat-form-field appearance="outline">
          <mat-label>Site</mat-label>
          <mat-select [(ngModel)]="siteId" name="siteId" required data-testid="bl-site">
            @for (s of sites(); track s.id) {
              <mat-option [value]="s.id">{{ s.code }} — {{ s.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Numéro BL</mat-label>
          <input
            matInput
            [(ngModel)]="number"
            name="number"
            required
            placeholder="BL-2026-0001"
            data-testid="bl-number"
          />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Client</mat-label>
          <mat-select [(ngModel)]="customerId" name="customerId" required data-testid="bl-customer">
            @for (c of customers(); track c.id) {
              <mat-option [value]="c.id">{{ c.code }} — {{ c.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Contrat de vente</mat-label>
          <mat-select
            [(ngModel)]="saleContractId"
            name="saleContractId"
            required
            [disabled]="!customerId"
            data-testid="bl-contract"
            (selectionChange)="onContractChange($event.value)"
          >
            @for (sc of filteredContracts(); track sc.id) {
              <mat-option [value]="sc.id">{{ sc.reference }} · {{ sc.calibreCode }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Calibre</mat-label>
          <input
            matInput
            [(ngModel)]="calibreCode"
            name="calibreCode"
            required
            data-testid="bl-calibre"
          />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Stockpile</mat-label>
          <mat-select [(ngModel)]="stockpileId" name="stockpileId" required data-testid="bl-stockpile">
            @for (sp of filteredStockpiles(); track sp.id) {
              <mat-option [value]="sp.id">{{ sp.code }} ({{ sp.calibreCode }})</mat-option>
            }
          </mat-select>
          @if (filteredStockpiles().length === 0 && siteId) {
            <mat-hint>Aucun stockpile correspondant — vérifie site & calibre</mat-hint>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Tonnage (kg)</mat-label>
          <input
            matInput
            type="number"
            min="0"
            step="1"
            [(ngModel)]="tonnageKg"
            name="tonnageKg"
            required
            data-testid="bl-tonnage"
          />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Date de livraison</mat-label>
          <input
            matInput
            [matDatepicker]="dp"
            [(ngModel)]="deliveryDate"
            name="deliveryDate"
            required
            data-testid="bl-date"
          />
          <mat-datepicker-toggle matIconSuffix [for]="dp"></mat-datepicker-toggle>
          <mat-datepicker #dp></mat-datepicker>
        </mat-form-field>

        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }

        <div class="actions">
          <button
            mat-flat-button
            color="primary"
            type="submit"
            [disabled]="submitting() || !canSubmit()"
            data-testid="bl-submit"
          >
            <mat-icon>save</mat-icon>
            <span>Créer le BL</span>
          </button>
          <a mat-stroked-button routerLink="/ventes/bl">Annuler</a>
        </div>
      </form>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .bl-create {
      max-width: 720px;
      display: flex;
      flex-direction: column;
      gap: var(--gv-space-5);
    }
    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--gv-space-4);
    }
    .page-header h1 {
      font-size: 22px;
      font-weight: 600;
      margin: 0;
    }

    .bl-form {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--gv-space-4) var(--gv-space-5);
      padding: var(--gv-space-5);
      background: var(--gv-surface);
      border: 1px solid var(--gv-border);
      border-radius: var(--gv-radius-md);
      box-shadow: var(--gv-shadow-1);
    }

    .mat-mdc-form-field { width: 100%; }

    .error {
      grid-column: 1 / -1;
      margin: 0;
      padding: var(--gv-space-3);
      background: var(--gv-danger-soft);
      border: 1px solid oklch(82% 0.12 25);
      border-radius: var(--gv-radius);
      color: oklch(35% 0.18 25);
      font-size: 13px;
    }

    .actions {
      grid-column: 1 / -1;
      display: flex;
      gap: var(--gv-space-3);
    }
    .actions button mat-icon { margin-right: 6px; }

    @media (max-width: 720px) {
      .bl-form { grid-template-columns: 1fr; }
      .actions { flex-direction: column; }
      .actions a, .actions button { width: 100%; }
    }
  `],
})
export class BlCreateComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly api = inject(VentesApiService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  readonly sites = signal<SiteOption[]>([]);
  readonly customers = signal<Customer[]>([]);
  readonly contracts = signal<SaleContract[]>([]);
  readonly stockpiles = signal<StockpileOption[]>([]);

  siteId = '';
  number = '';
  customerId = '';
  saleContractId = '';
  stockpileId = '';
  calibreCode = '';
  tonnageKg: number | null = null;
  deliveryDate: Date | null = new Date();

  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  readonly filteredContracts = computed(() =>
    this.contracts().filter((c) => !this.customerId || c.customerId === this.customerId),
  );

  readonly filteredStockpiles = computed(() =>
    this.stockpiles().filter(
      (sp) =>
        (!this.siteId || sp.siteId === this.siteId) &&
        (!this.calibreCode || sp.calibreCode === this.calibreCode),
    ),
  );

  async ngOnInit(): Promise<void> {
    // Pre-fill BL number with a date-based draft. Operator can overwrite.
    const today = new Date();
    const yyyy = today.getFullYear();
    const seq = Math.floor(Math.random() * 9999)
      .toString()
      .padStart(4, '0');
    this.number = `BL-${yyyy}-${seq}`;

    try {
      const [sites, customers, contracts, stockpiles] = await Promise.all([
        firstValueFrom(this.http.get<unknown>('/api/sites')).then(toSiteList),
        firstValueFrom(this.api.listCustomers()),
        firstValueFrom(this.api.listContracts()),
        firstValueFrom(this.http.get<StockpileOption[]>('/api/stockpiles')),
      ]);
      this.sites.set(sites);
      this.customers.set(customers);
      this.contracts.set(contracts);
      this.stockpiles.set(Array.isArray(stockpiles) ? stockpiles : []);
    } catch (err) {
      console.error('[BlCreate] reference data load failed', err);
      this.error.set(
        'Impossible de charger les données de référence. Vérifie que les modules Sites / Clients / Stockpile sont disponibles.',
      );
    }
  }

  onContractChange(contractId: string): void {
    const c = this.contracts().find((sc) => sc.id === contractId);
    if (c && !this.calibreCode) this.calibreCode = c.calibreCode;
  }

  canSubmit(): boolean {
    return Boolean(
      this.siteId &&
        this.number &&
        this.customerId &&
        this.saleContractId &&
        this.stockpileId &&
        this.calibreCode &&
        this.tonnageKg !== null &&
        this.tonnageKg > 0 &&
        this.deliveryDate,
    );
  }

  async onSubmit(evt: Event): Promise<void> {
    evt.preventDefault();
    this.error.set(null);
    if (!this.canSubmit() || this.submitting()) return;

    this.submitting.set(true);
    try {
      const created = await firstValueFrom(
        this.api.createBL({
          siteId: this.siteId,
          number: this.number,
          customerId: this.customerId,
          saleContractId: this.saleContractId,
          stockpileId: this.stockpileId,
          calibreCode: this.calibreCode,
          tonnageKg: Number(this.tonnageKg),
          deliveryDate: formatDate(this.deliveryDate!),
        }),
      );
      this.snack.open(`BL ${created.number} créé`, 'OK', { duration: 4000 });
      await this.router.navigate(['/ventes/bl']);
    } catch (err: unknown) {
      console.error('[BlCreate] submit failed', err);
      this.error.set(extractErrorMessage(err));
    } finally {
      this.submitting.set(false);
    }
  }
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toSiteList(res: unknown): SiteOption[] {
  const rows = Array.isArray(res)
    ? (res as Array<Record<string, unknown>>)
    : Array.isArray((res as { data?: unknown }).data)
      ? ((res as { data: Array<Record<string, unknown>> }).data)
      : [];
  return rows.map((r) => ({
    id: String(r['id'] ?? ''),
    code: String(r['code'] ?? ''),
    name: String(r['name'] ?? ''),
  }));
}

function extractErrorMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const e = err as { error?: { message?: string | string[] }; message?: string };
    const m = e.error?.message ?? e.message;
    if (Array.isArray(m)) return m.join(', ');
    if (typeof m === 'string') return m;
  }
  return 'Erreur inconnue. Réessaie ou contacte le support.';
}
