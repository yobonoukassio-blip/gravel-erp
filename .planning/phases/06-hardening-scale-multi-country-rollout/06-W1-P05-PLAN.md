---
phase: 06-hardening-scale-multi-country-rollout
plan: W1-P05
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/api/src/migrations/1716192000000__add_tenant_compliance_email.sql
  - apps/api/src/modules/audit/audit-export.controller.ts
  - apps/api/src/modules/audit/audit-export.service.ts
  - apps/api/src/modules/audit/audit-export.types.ts
  - apps/api/src/modules/audit/audit-export.spec.ts
  - apps/api/src/modules/audit/audit-export.cron.ts
  - apps/api/src/modules/audit/audit-export.cron.spec.ts
  - apps/api/src/modules/audit/audit.module.ts
autonomous: true
requirements: [HRD-MVP-05]
requirements_covered: [HRD-MVP-05]
must_haves:
  truths:
    - "GET /api/audit/export?tenant_id=X&from=Y&to=Z returns audit chain rows + hash-verification report + compliance summary CSV (D-14)."
    - "Endpoint verifies chain-of-hash integrity per ADR-0004 and flags any breaks (D-15)."
    - "Output is signed (S3 presigned URL, 24h expiry) (D-15)."
    - "Quarterly cron auto-emits export per tenant and emails the tenant compliance contact via Phase 9 NotificationService (D-16)."
    - "Migration adds `compliance_email` column to tenant table, default = billing_contact email."
  artifacts:
    - path: "apps/api/src/modules/audit/audit-export.controller.ts"
      provides: "REST endpoint GET /api/audit/export"
      contains: "@Get('export')"
    - path: "apps/api/src/modules/audit/audit-export.service.ts"
      provides: "Export builder + chain-of-hash verifier + S3 presign + CSV writer"
      contains: "verifyChain"
    - path: "apps/api/src/modules/audit/audit-export.cron.ts"
      provides: "Quarterly @Cron job calling service per tenant + emailing compliance contact"
      contains: "@Cron"
    - path: "apps/api/src/migrations/1716192000000__add_tenant_compliance_email.sql"
      provides: "SQL migration adding compliance_email column to tenant"
      contains: "compliance_email"
  key_links:
    - from: "apps/api/src/modules/audit/audit-export.cron.ts"
      to: "apps/api/src/modules/notification/notification.service.ts"
      via: "Inject NotificationService for email dispatch"
      pattern: "NotificationService"
    - from: "apps/api/src/modules/audit/audit-export.service.ts"
      to: "apps/api/src/modules/audit/audit-chain.verifier.ts"
      via: "Use existing verifier to validate chain integrity"
      pattern: "AuditChainVerifier|audit-chain.verifier"
    - from: "apps/api/src/modules/audit/audit.module.ts"
      to: "apps/api/src/modules/audit/audit-export.controller.ts"
      via: "Controller registered in module"
      pattern: "AuditExportController"
---

<objective>
Implement HRD-MVP-05 — per-tenant audit chain export endpoint + quarterly cron auto-delivery to the tenant's compliance contact, per D-14/15/16. Add `compliance_email` column to tenant table (defaulting to billing contact per CONTEXT.md specifics).

Purpose: OHADA compliance and future ISO 27001 certification require demonstrable audit trail integrity per tenant per quarter. ADR-0004 implemented the per-(tenant,table) hash chain; this plan exposes it as a self-service export with cryptographic verification + S3 signed delivery, and automates the quarterly send so customers don't need to ask.

Output: REST endpoint + service + cron + migration + tests in the existing audit module (per CONTEXT.md "Reusable Assets": extend, do not create new module).

Wave assignment: this plan is INDEPENDENT of W1-P01..P04 (touches audit module only; uses Phase 9 NotificationService which is already shipped). Runs in Wave 1 parallel with them.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/phases/06-hardening-scale-multi-country-rollout/06-CONTEXT.md
@docs/adr/ADR-0004-audit-chain-of-hash.md
@docs/adr/ADR-0001-rls-multi-tenancy.md
@apps/api/src/modules/audit/audit.module.ts
@apps/api/src/modules/audit/audit-log.entity.ts
@apps/api/src/modules/audit/audit-chain.verifier.ts
@apps/api/src/modules/notification/notification.service.ts

<interfaces>
<!-- Extracted contracts the executor needs. Read these before implementing. -->

From apps/api/src/modules/notification/notification.service.ts (Phase 9 NTF-01):
```typescript
// Available method for email dispatch — DO NOT instantiate Brevo directly.
class NotificationService {
  enqueueEmail(payload: { tenantId: string; to: string; subject: string; body: string; attachments?: { filename: string; url: string }[] }): Promise<void>;
}
```

From apps/api/src/modules/audit/audit-chain.verifier.ts (existing, per ADR-0004):
```typescript
// Existing verifier — use this; do not duplicate chain logic.
interface ChainVerificationResult {
  tenantId: string;
  tableName: string;
  totalRows: number;
  brokenAt: { rowId: string; expectedHash: string; actualHash: string } | null;
  verifiedAt: Date;
}

class AuditChainVerifier {
  verifyChain(tenantId: string, tableName: string, from: Date, to: Date): Promise<ChainVerificationResult>;
}
```

From RLS/CLS context (ADR-0001):
- All queries MUST run inside `SET LOCAL app.current_tenant = '{tenant_id}'` via the existing AsyncLocalStorage middleware.
- The export controller MUST validate that the caller has either `role=COMPLIANCE_OFFICER` for `tenant_id` OR `role=PLATFORM_ADMIN` (cross-tenant access).

Migrations convention (pre-resolved by inspecting `apps/api/src/modules/audit/` and `apps/api/src/migrations/`):
- Audit module has NO `migrations/` subdir; central `apps/api/src/migrations/` is the canonical location.
- Naming pattern (from existing files): `{epoch_ms}__{snake_name}.sql` — raw SQL, NOT TypeORM TS classes.
- This plan's migration: `apps/api/src/migrations/1716192000000__add_tenant_compliance_email.sql`.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Migration — add compliance_email column to tenant table (SQL, central migrations dir)</name>
  <files>apps/api/src/migrations/1716192000000__add_tenant_compliance_email.sql</files>
  <read_first>
    - apps/api/src/migrations/ (existing migrations follow `{epoch_ms}__{snake_name}.sql` raw SQL pattern — do NOT introduce TS migrations)
    - .planning/phases/06-hardening-scale-multi-country-rollout/06-CONTEXT.md "Specific Ideas" — compliance_email defaults to billing contact
    - docs/adr/ADR-0001-rls-multi-tenancy.md (tenant table is shared, NOT tenant-scoped — migration runs once)
  </read_first>
  <action>
Create `apps/api/src/migrations/1716192000000__add_tenant_compliance_email.sql`:

```sql
-- HRD-MVP-05 Task 1 — add tenant.compliance_email
-- D-16: quarterly audit-export cron emails this address. Defaults to billing contact.

BEGIN;

-- 1. Add nullable column
ALTER TABLE tenant
  ADD COLUMN IF NOT EXISTS compliance_email VARCHAR(255);

-- 2. Backfill from billing_email where present
UPDATE tenant
   SET compliance_email = billing_email
 WHERE compliance_email IS NULL
   AND billing_email IS NOT NULL;

-- 3. Email-format CHECK (NULL-tolerant: rows lacking billing_email won't fail —
--    ops follow-up tracked in REMEDIATION/tech-debt).
ALTER TABLE tenant
  ADD CONSTRAINT tenant_compliance_email_format
  CHECK (
    compliance_email IS NULL
    OR compliance_email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  );

COMMIT;
```

Use SQL (NOT a TypeORM TS migration class) because every existing migration under `apps/api/src/migrations/` follows this raw-SQL convention. Verify the next available epoch_ms prefix is greater than the highest existing one before committing.
  </action>
  <verify>
    <automated>test -f apps/api/src/migrations/1716192000000__add_tenant_compliance_email.sql && grep -q "compliance_email" apps/api/src/migrations/1716192000000__add_tenant_compliance_email.sql && grep -q "billing_email" apps/api/src/migrations/1716192000000__add_tenant_compliance_email.sql</automated>
  </verify>
  <acceptance_criteria>
    - Migration file exists at exact path `apps/api/src/migrations/1716192000000__add_tenant_compliance_email.sql`
    - Adds nullable `compliance_email` column
    - Backfills from `billing_email`
    - Adds email-format CHECK constraint (NULL-tolerant)
    - Wrapped in BEGIN/COMMIT for atomicity
    - Follows existing naming convention (`{epoch_ms}__{snake_name}.sql`)
  </acceptance_criteria>
  <done>tenant.compliance_email exists with backfilled values; export cron has a destination address per tenant.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Audit export service + controller + types — chain verification + S3 presign + CSV</name>
  <files>apps/api/src/modules/audit/audit-export.types.ts, apps/api/src/modules/audit/audit-export.service.ts, apps/api/src/modules/audit/audit-export.controller.ts, apps/api/src/modules/audit/audit-export.spec.ts, apps/api/src/modules/audit/audit.module.ts</files>
  <read_first>
    - apps/api/src/modules/audit/audit.module.ts (existing module wiring)
    - apps/api/src/modules/audit/audit-chain.verifier.ts (reuse — do NOT duplicate chain logic)
    - apps/api/src/modules/audit/audit-log.entity.ts (entity shape for export rows)
    - docs/adr/ADR-0001-rls-multi-tenancy.md (RBAC: COMPLIANCE_OFFICER or PLATFORM_ADMIN)
    - docs/adr/ADR-0004-audit-chain-of-hash.md (chain semantics)
  </read_first>
  <behavior>
    - Test 1: AuditExportService.export({tenantId, from, to}) returns object with shape `{ auditRows: AuditLogRow[], chainVerification: ChainVerificationResult[], complianceCsvUrl: string }`
    - Test 2: chainVerification array contains one entry per table touched in the date range; entries with `brokenAt !== null` flag integrity break
    - Test 3: complianceCsvUrl is an S3 presigned URL with 24h expiry (parsed from `X-Amz-Expires=86400`)
    - Test 4: Controller @Get('export') rejects when caller lacks COMPLIANCE_OFFICER role for tenant_id (returns 403)
    - Test 5: Service runs all queries inside `SET LOCAL app.current_tenant` (verify by spying on the AsyncLocalStorage tenant context)
  </behavior>
  <action>

### 1. `apps/api/src/modules/audit/audit-export.types.ts`

```ts
export interface AuditExportRequest {
  tenantId: string;
  from: Date;
  to: Date;
}

export interface AuditExportResponse {
  auditRows: AuditExportRow[];
  chainVerification: ChainVerificationResult[];
  complianceCsvUrl: string;       // S3 presigned, 24h expiry
  generatedAt: string;            // ISO-8601
  signedBy: 'gravel-audit-export-v1';
}

export interface AuditExportRow {
  id: string;
  tenantId: string;
  tableName: string;
  rowId: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  changedAt: string;
  changedBy: string;
  beforeHash: string;
  afterHash: string;
}

// Re-export from existing verifier for the response shape
export type { ChainVerificationResult } from './audit-chain.verifier';
```

### 2. `apps/api/src/modules/audit/audit-export.service.ts`

```ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';
import { AuditChainVerifier } from './audit-chain.verifier';
import { AuditExportRequest, AuditExportResponse, AuditExportRow } from './audit-export.types';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const PRESIGN_EXPIRY_SECONDS = 86400; // 24h per D-15

@Injectable()
export class AuditExportService {
  private readonly logger = new Logger(AuditExportService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(
    @InjectRepository(AuditLog) private readonly auditRepo: Repository<AuditLog>,
    private readonly verifier: AuditChainVerifier,
  ) {
    this.s3 = new S3Client({ region: process.env.AWS_REGION || 'eu-central-1' });
    this.bucket = process.env.AUDIT_EXPORT_S3_BUCKET || process.env.S3_HSE_BUCKET || 'gravel-prod-audit-exports';
  }

  async export(req: AuditExportRequest): Promise<AuditExportResponse> {
    const { tenantId, from, to } = req;

    // 1. Fetch audit rows in window (RLS-scoped via existing middleware)
    const rows = await this.auditRepo
      .createQueryBuilder('a')
      .where('a.tenant_id = :tenantId', { tenantId })
      .andWhere('a.changed_at >= :from', { from })
      .andWhere('a.changed_at < :to', { to })
      .orderBy('a.changed_at', 'ASC')
      .getMany();

    const auditRows: AuditExportRow[] = rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      tableName: r.tableName,
      rowId: r.rowId,
      operation: r.operation as AuditExportRow['operation'],
      changedAt: r.changedAt.toISOString(),
      changedBy: r.changedBy,
      beforeHash: r.beforeHash,
      afterHash: r.afterHash,
    }));

    // 2. Verify chain per distinct table
    const distinctTables = Array.from(new Set(rows.map((r) => r.tableName)));
    const chainVerification = await Promise.all(
      distinctTables.map((tbl) => this.verifier.verifyChain(tenantId, tbl, from, to)),
    );

    // 3. Write CSV to S3 + presign
    const csv = this.toComplianceCsv(auditRows, chainVerification);
    const key = `audit-exports/${tenantId}/${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}_${Date.now()}.csv`;
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: csv,
      ContentType: 'text/csv; charset=utf-8',
      ServerSideEncryption: 'AES256',
    }));
    const complianceCsvUrl = await getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: PRESIGN_EXPIRY_SECONDS },
    );

    return {
      auditRows,
      chainVerification,
      complianceCsvUrl,
      generatedAt: new Date().toISOString(),
      signedBy: 'gravel-audit-export-v1',
    };
  }

  private toComplianceCsv(rows: AuditExportRow[], chain: any[]): string {
    const header = 'id,tenant_id,table,row_id,operation,changed_at,changed_by,before_hash,after_hash\n';
    const body = rows.map((r) =>
      [r.id, r.tenantId, r.tableName, r.rowId, r.operation, r.changedAt, r.changedBy, r.beforeHash, r.afterHash].join(','),
    ).join('\n');
    const summaryHeader = '\n\n## CHAIN VERIFICATION SUMMARY\ntable,total_rows,broken_row_id,verified_at\n';
    const summaryBody = chain.map((c) =>
      [c.tableName, c.totalRows, c.brokenAt?.rowId || '', c.verifiedAt?.toISOString?.() || c.verifiedAt].join(','),
    ).join('\n');
    return header + body + summaryHeader + summaryBody;
  }
}
```

### 3. `apps/api/src/modules/audit/audit-export.controller.ts`

```ts
import { Controller, Get, Query, ForbiddenException, BadRequestException, UseGuards } from '@nestjs/common';
import { AuditExportService } from './audit-export.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { AuditExportResponse } from './audit-export.types';

@Controller('audit')
@UseGuards(JwtAuthGuard)
export class AuditExportController {
  constructor(private readonly svc: AuditExportService) {}

  @Get('export')
  async export(
    @Query('tenant_id') tenantId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: { tenantId: string; roles: string[] },
  ): Promise<AuditExportResponse> {
    if (!tenantId || !from || !to) {
      throw new BadRequestException('tenant_id, from, to are required');
    }
    const isPlatformAdmin = user.roles.includes('PLATFORM_ADMIN');
    const isComplianceForTenant = user.roles.includes('COMPLIANCE_OFFICER') && user.tenantId === tenantId;
    if (!isPlatformAdmin && !isComplianceForTenant) {
      throw new ForbiddenException('Requires COMPLIANCE_OFFICER for tenant or PLATFORM_ADMIN');
    }
    return this.svc.export({
      tenantId,
      from: new Date(from),
      to: new Date(to),
    });
  }
}
```

### 4. `apps/api/src/modules/audit/audit-export.spec.ts` — at least 5 tests matching the `<behavior>` block.

### 5. Edit `apps/api/src/modules/audit/audit.module.ts` — register `AuditExportService`, `AuditExportController`. Import as needed; do not break existing exports.

### 6. Per D-14 endpoint signature must be EXACTLY:
```
GET /api/audit/export?tenant_id={uuid}&from={iso}&to={iso}
```
returning JSON of shape `{auditRows[], chainVerification[], complianceCsvUrl, generatedAt, signedBy}`.

Per CONTEXT.md "All cross-cutting concerns via NestJS DI" — DO NOT introduce a new audit-export module; extend the existing `audit.module.ts`.
  </action>
  <verify>
    <automated>cd apps/api && npx vitest run src/modules/audit/audit-export.spec.ts --reporter=verbose && cd apps/api && npx tsc --noEmit --project tsconfig.json 2>&1 | head -50</automated>
  </verify>
  <acceptance_criteria>
    - Controller exposes `@Get('export')` matching D-14 signature exactly
    - Service uses existing AuditChainVerifier (no duplication)
    - S3 presigned URL has 24h expiry (D-15)
    - RBAC enforced: COMPLIANCE_OFFICER for tenant OR PLATFORM_ADMIN
    - 5 tests minimum, all passing
    - TypeScript compiles cleanly
  </acceptance_criteria>
  <done>An authorized compliance officer can hit GET /api/audit/export and receive a signed CSV URL plus structured JSON proving chain integrity for their tenant in the requested window.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Quarterly cron — auto-export per tenant + email via NotificationService</name>
  <files>apps/api/src/modules/audit/audit-export.cron.ts, apps/api/src/modules/audit/audit-export.cron.spec.ts, apps/api/src/modules/audit/audit.module.ts</files>
  <read_first>
    - apps/api/src/modules/audit/audit-export.service.ts (just-created — Task 2)
    - apps/api/src/modules/notification/notification.service.ts (Phase 9 NotificationService — interface in plan <interfaces> block)
    - .planning/phases/06-hardening-scale-multi-country-rollout/06-CONTEXT.md (D-16)
    - State (.planning/STATE.md) — confirms BullMQ NotificationService shipped in Phase 9
  </read_first>
  <behavior>
    - Test 1: @Cron('0 4 1 1,4,7,10 *') (quarterly: 1st of Jan/Apr/Jul/Oct, 04:00 UTC) triggers AuditExportCron.run()
    - Test 2: run() iterates over all tenants where `active = true` AND `compliance_email IS NOT NULL`
    - Test 3: For each tenant, calls AuditExportService.export({tenantId, from = prev quarter start, to = current quarter start})
    - Test 4: Enqueues email via NotificationService.enqueueEmail({to: tenant.compliance_email, subject: "Q{n} {year} Audit Export — Gravel Ivoire", body: <link>, attachments: [{filename: 'audit.csv', url: complianceCsvUrl}]})
    - Test 5: On AuditExportService failure for one tenant, continues with next tenant (per-tenant fault isolation); logs error
  </behavior>
  <action>

### 1. `apps/api/src/modules/audit/audit-export.cron.ts`

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditExportService } from './audit-export.service';
import { NotificationService } from '../notification/notification.service';
// Tenant entity — adjust import path to match actual location
import { Tenant } from '../master-data/tenant.entity';

@Injectable()
export class AuditExportCron {
  private readonly logger = new Logger(AuditExportCron.name);

  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly exportSvc: AuditExportService,
    private readonly notifications: NotificationService,
  ) {}

  // Quarterly: 1st of Jan/Apr/Jul/Oct at 04:00 UTC (D-16)
  @Cron('0 4 1 1,4,7,10 *', { name: 'audit-quarterly-export', timeZone: 'UTC' })
  async run(): Promise<void> {
    const { from, to } = this.previousQuarterWindow(new Date());
    const quarterLabel = this.quarterLabel(from);

    const tenants = await this.tenants
      .createQueryBuilder('t')
      .where('t.active = true')
      .andWhere('t.compliance_email IS NOT NULL')
      .getMany();

    this.logger.log(`[audit-export-cron] Starting ${quarterLabel} for ${tenants.length} tenants`);

    for (const tenant of tenants) {
      try {
        const result = await this.exportSvc.export({ tenantId: tenant.id, from, to });
        await this.notifications.enqueueEmail({
          tenantId: tenant.id,
          to: tenant.complianceEmail!,
          subject: `${quarterLabel} Audit Export — Gravel Ivoire`,
          body: this.composeBody(tenant, quarterLabel, result.complianceCsvUrl),
          attachments: [{ filename: `audit-${quarterLabel}.csv`, url: result.complianceCsvUrl }],
        });
        this.logger.log(`[audit-export-cron] Sent for tenant=${tenant.id}`);
      } catch (err) {
        this.logger.error(`[audit-export-cron] FAILED for tenant=${tenant.id}: ${err}`);
        // Continue with next tenant (per-tenant fault isolation)
      }
    }
  }

  private previousQuarterWindow(now: Date): { from: Date; to: Date } {
    const month = now.getUTCMonth(); // 0-11
    const currentQuarterStartMonth = Math.floor(month / 3) * 3;
    const to = new Date(Date.UTC(now.getUTCFullYear(), currentQuarterStartMonth, 1));
    const from = new Date(Date.UTC(
      currentQuarterStartMonth === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear(),
      currentQuarterStartMonth === 0 ? 9 : currentQuarterStartMonth - 3,
      1,
    ));
    return { from, to };
  }

  private quarterLabel(d: Date): string {
    const q = Math.floor(d.getUTCMonth() / 3) + 1;
    return `Q${q} ${d.getUTCFullYear()}`;
  }

  private composeBody(tenant: any, quarterLabel: string, url: string): string {
    return `Bonjour,

Veuillez trouver ci-joint l'export d'audit trimestriel ${quarterLabel} pour ${tenant.name}.

Le rapport contient :
- Toutes les opérations auditées sur la période
- La vérification cryptographique de la chaîne de hash (intégrité)
- Un résumé CSV exploitable

Lien direct (valide 24h) : ${url}

Cordialement,
Gravel Ivoire — Audit Compliance
`;
  }
}
```

### 2. `apps/api/src/modules/audit/audit-export.cron.spec.ts` — at least 5 tests matching the `<behavior>` block. Mock the Tenant repo, AuditExportService, NotificationService.

### 3. Edit `apps/api/src/modules/audit/audit.module.ts`:
- Add `ScheduleModule.forRoot()` import if not already present
- Add `NotificationModule` (or `NotificationService` provider) import
- Register `AuditExportCron` as a provider
- Ensure TypeOrmModule.forFeature includes Tenant entity (or wire via shared MasterDataModule)
  </action>
  <verify>
    <automated>cd apps/api && npx vitest run src/modules/audit/audit-export.cron.spec.ts --reporter=verbose && cd apps/api && npx tsc --noEmit --project tsconfig.json 2>&1 | head -50</automated>
  </verify>
  <acceptance_criteria>
    - Cron expression matches `0 4 1 1,4,7,10 *` (quarterly Jan/Apr/Jul/Oct at 04:00 UTC) per D-16
    - Iterates only active tenants with compliance_email set
    - Per-tenant fault isolation: one tenant failure does not abort the run
    - Email body in FR (primary per CONTEXT.md D-25 locale baseline)
    - 5 tests minimum, all passing
    - audit.module.ts wires everything (no missing-provider errors)
  </acceptance_criteria>
  <done>Every quarter, every active tenant with a compliance contact receives a signed audit-export CSV automatically — no human intervention.</done>
</task>

</tasks>

<verification>
- Migration adds compliance_email column with backfill (SQL, central migrations dir).
- REST endpoint GET /api/audit/export matches D-14 signature.
- Quarterly cron auto-emits + emails via Phase 9 NotificationService.
- All chain verification uses existing AuditChainVerifier (no duplication of ADR-0004 logic).
- 10+ unit tests across the 3 spec files passing.
</verification>

<success_criteria>
HRD-MVP-05 satisfied: tenants receive cryptographically-verified audit exports quarterly with no operator intervention; on-demand export available via authenticated REST.
</success_criteria>

<output>
After completion, create `.planning/phases/06-hardening-scale-multi-country-rollout/06-W1-P05-SUMMARY.md`.
</output>
