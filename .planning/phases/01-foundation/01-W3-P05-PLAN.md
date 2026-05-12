---
phase: 01-foundation
plan: 05
type: execute
wave: 3
depends_on: [01, 02, 04]
files_modified:
  - apps/api/src/modules/master-data/master-data.controller.ts
  - apps/api/src/modules/master-data/dto/site.dto.ts
  - apps/api/src/modules/master-data/dto/zone.dto.ts
  - apps/api/src/modules/master-data/dto/bench.dto.ts
  - apps/api/src/modules/master-data/dto/permit.dto.ts
  - apps/api/src/modules/master-data/master-data.service.ts
  - apps/web/src/app/features/sites/sites-list.component.ts
  - apps/web/src/app/features/sites/site-form.component.ts
  - apps/web/src/app/features/sites/site-form.schema.ts
  - apps/web/src/app/features/sites/sites.routes.ts
  - apps/web/src/app/features/zones/zones-list.component.ts
  - apps/web/src/app/features/zones/zone-form.component.ts
  - apps/web/src/app/features/benches/benches-list.component.ts
  - apps/web/src/app/features/permits/permits-list.component.ts
  - apps/web/src/app/features/permits/permit-form.component.ts
  - apps/web/src/app/features/activity-log/activity-log-list.component.ts
  - apps/web/src/app/shared/ag-grid/tenant-aware-grid.component.ts
  - apps/web/src/app/shared/formly/gps-picker-leaflet.type.ts
  - apps/web/src/app/shared/formly/polygon-picker-leaflet.type.ts
  - apps/web/src/app/app.routes.ts
  - apps/web/e2e/site-create.e2e.ts
autonomous: true
requirements: [FND-04, FND-05]
must_haves:
  truths:
    - "A tenant admin user logs in via Keycloak, navigates to /sites, fills the form (name, code, country, IANA timezone, functional currency, GPS via Leaflet picker, manager, capacity, status), submits, and the site is persisted with PostGIS geometry"
    - "From the site detail page, the admin defines production zones + benches (polygons via Leaflet) and permits (type, authority, reference, valid_from/valid_to, document upload via presigned S3 URL)"
    - "Soft-delete only: archiving a site sets archived_at; no DELETE button anywhere"
    - "AG-Grid list views are server-side-paginated and tenant-scoped (RLS enforced at API layer)"
    - "The journal d'activité quotidien (from plan 03) appears in a read-only filterable list at /activity-log scoped to current user's site_ids"
  artifacts:
    - path: "apps/api/src/modules/master-data/master-data.controller.ts"
      provides: "CRUD endpoints for Site, Zone, Bench, Permit with @SiteScope guards"
    - path: "apps/web/src/app/features/sites/site-form.schema.ts"
      provides: "Formly JSON schema for Site form per D-24 fields"
    - path: "apps/web/src/app/shared/formly/gps-picker-leaflet.type.ts"
      provides: "Custom Formly field: Leaflet map → emits GeoJSON Point"
    - path: "apps/web/e2e/site-create.e2e.ts"
      provides: "End-to-end test for FND-04 site creation flow"
  key_links:
    - from: "apps/web sites-list"
      to: "/api/sites"
      via: "TanStack Query + AgGrid serverSideDatasource"
      pattern: "queryFn"
    - from: "site-form.component"
      to: "/api/sites POST"
      via: "Formly validation + TanStack Query mutation"
      pattern: "useMutation"
    - from: "permit form upload"
      to: "S3 presigned URL"
      via: "POST /api/attachments → presigned PUT"
      pattern: "presigned"
---

<objective>
Master Data CRUD UI scaffolds: Angular Material + AG-Grid + Formly forms for Tenant/Country (read-only Phase 1) and Site/ProductionZone/Bench/Permit (full CRUD with PostGIS Leaflet pickers), backed by NestJS controllers built on top of the entities from plan 02. Plus a read-only filterable list for the journal d'activité quotidien (consuming the daily_activity_log table from plan 03). Soft-delete only per D-26. Turns GREEN: FND-04 (tenant admin creates site E2E), FND-05 (zones + benches + permits CRUD).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/phases/01-foundation/01-CONTEXT.md
@.planning/phases/01-foundation/01-RESEARCH.md
@.planning/phases/01-foundation/01-VALIDATION.md
@.planning/phases/01-foundation/01-W1-P02-PLAN.md
@.planning/phases/01-foundation/01-W1-P04-PLAN.md

<interfaces>
Backend entities (from plan 02):
- `Site { id, tenant_id, country_id, name, code, gps_point: Point, iana_timezone, functional_currency, manager_user_id, capacity_t_per_day, status, archived_at }`
- `ProductionZone { id, tenant_id, site_id, name, code, geometry: Polygon, status, archived_at }`
- `Bench { id, tenant_id, production_zone_id, name, geometry: Polygon, status, archived_at }`
- `Permit { id, tenant_id, site_id, type, authority, reference, valid_from, valid_to, document_url, status }`

Guards from plan 04:
- `JwtAuthGuard`, `TenantGuard`, `SiteScopeGuard`, `@Role()` decorator

CLS keys: TENANT_ID, USER_ID, SITE_IDS, ROLE.

Soft-delete convention (D-26): PATCH /api/sites/:id/archive sets status='archived' + archived_at=now(). No DELETE endpoint.
</interfaces>
</context>

<tasks>

<task type="auto" id="W2-P05-T01" tdd="true">
  <name>Backend master-data controllers + DTOs + service</name>
  <files>apps/api/src/modules/master-data/master-data.controller.ts, apps/api/src/modules/master-data/master-data.service.ts, apps/api/src/modules/master-data/dto/site.dto.ts, apps/api/src/modules/master-data/dto/zone.dto.ts, apps/api/src/modules/master-data/dto/bench.dto.ts, apps/api/src/modules/master-data/dto/permit.dto.ts</files>
  <read_first>
    - .planning/phases/01-foundation/01-CONTEXT.md (D-23 to D-26)
    - .planning/phases/01-foundation/01-W1-P02-PLAN.md (entities)
    - .planning/phases/01-foundation/01-W1-P04-PLAN.md (guards)
  </read_first>
  <behavior>
    - Test: POST /api/sites with valid body (name, code, country_id, iana_timezone='Africa/Abidjan', functional_currency='XOF', gps_point GeoJSON Point, manager_user_id, capacity_t_per_day=1000) → 201 returns full site with PostGIS WKT round-tripped
    - Test: Duplicate (tenant_id, code) → 409
    - Test: Invalid IANA tz (e.g., 'Foobar/Baz') → 400
    - Test: Unknown ISO currency → 400 (must be in CURRENCY_SCALE)
    - Test: GET /api/sites returns server-side-paginated list filtered to user's site_ids unless groupScope='group'
    - Test: PATCH /api/sites/:id/archive → status='archived' + archived_at set; subsequent reads still return the row (soft-delete)
    - Test: DELETE /api/sites/:id → 405 Method Not Allowed (no hard-delete endpoint exists)
    - Same coverage for /api/zones, /api/benches, /api/permits with their respective fields
    - Test: POST /api/permits with document → flow: client first calls POST /api/attachments {sha256, size, mime} → receives presigned PUT URL → uploads → permit references the sha256
  </behavior>
  <action>
    `apps/api/src/modules/master-data/dto/site.dto.ts`:
      ```ts
      import { IsString, IsUUID, IsIn, Matches, ValidateNested, IsInt, Min, IsOptional } from 'class-validator';
      import { Type } from 'class-transformer';
      import { CURRENCY_SCALE } from '@gravel/shared-types';

      export class GpsPointDto {
        @IsIn(['Point']) type!: 'Point';
        // [lng, lat]
        coordinates!: [number, number];
      }
      export class CreateSiteDto {
        @IsString() @Matches(/^[a-zA-Z0-9-_]{3,30}$/) code!: string;
        @IsString() name!: string;
        @IsUUID() countryId!: string;
        @IsString() @Matches(/^[A-Za-z]+\/[A-Za-z_]+$/) ianaTimezone!: string;
        @IsString() @IsIn(Object.keys(CURRENCY_SCALE)) functionalCurrency!: string;
        @ValidateNested() @Type(() => GpsPointDto) gpsPoint!: GpsPointDto;
        @IsUUID() managerUserId!: string;
        @IsInt() @Min(0) capacityTPerDay!: number;
      }
      ```
    Repeat for Zone, Bench, Permit DTOs.

    `apps/api/src/modules/master-data/master-data.service.ts`: uses TenantAwareRepository injected for each entity; converts GeoJSON → PostGIS WKT via `ST_GeomFromGeoJSON`; for IANA timezone validation calls `Intl.DateTimeFormat(undefined, {timeZone: tz}).resolvedOptions().timeZone` and throws if mismatch.

    `apps/api/src/modules/master-data/master-data.controller.ts`:
      ```ts
      @UseGuards(JwtAuthGuard, TenantGuard)
      @Controller('api')
      export class MasterDataController {
        @Post('sites') @Role('DIRECTION_GROUPE','DIRECTEUR_SITE')
        createSite(@Body() dto: CreateSiteDto) { ... }
        @Get('sites') listSites(@Query() q: ListSitesQuery) { ... }
        @Get('sites/:id') @UseGuards(SiteScopeGuard) getSite(@Param('id') id: string) { ... }
        @Patch('sites/:id') @UseGuards(SiteScopeGuard) updateSite(...) {...}
        @Patch('sites/:id/archive') @UseGuards(SiteScopeGuard) archive(...) {...}
        // NO @Delete handler — hard delete forbidden per D-26
        // Similar for zones, benches, permits
        @Post('attachments') @Role('DIRECTION_GROUPE','DIRECTEUR_SITE','HSE')
        presignAttachment(@Body() {sha256, size, mime}: AttachmentPresignDto) { ... }
      }
      ```
    `presignAttachment`: returns `{uploadUrl: string, objectKey: string}` where objectKey = sha256 (content-addressed per D-29).
  </action>
  <verify>
    <automated>pnpm --filter @gravel/api test:int -- master-data 2>&1 | tail -30</automated>
  </verify>
  <acceptance_criteria>
    - All endpoints behave per behavior list
    - No `@Delete` decorator anywhere in master-data.controller.ts (`grep -c "@Delete" apps/api/src/modules/master-data/master-data.controller.ts` returns 0)
    - IANA timezone validation rejects invalid strings
    - Currency must be in CURRENCY_SCALE keys
    - Presigned URL endpoint uses content-addressed (sha256) keys
    - master-data.spec.ts behaviors all green
  </acceptance_criteria>
  <done>API surface for master-data complete.</done>
</task>

<task type="auto" id="W2-P05-T02" tdd="true">
  <name>Angular CRUD shells: Site, Zone, Bench, Permit + Leaflet pickers + ActivityLog list</name>
  <files>apps/web/src/app/features/sites/sites-list.component.ts, apps/web/src/app/features/sites/site-form.component.ts, apps/web/src/app/features/sites/site-form.schema.ts, apps/web/src/app/features/sites/sites.routes.ts, apps/web/src/app/features/zones/zones-list.component.ts, apps/web/src/app/features/zones/zone-form.component.ts, apps/web/src/app/features/benches/benches-list.component.ts, apps/web/src/app/features/permits/permits-list.component.ts, apps/web/src/app/features/permits/permit-form.component.ts, apps/web/src/app/features/activity-log/activity-log-list.component.ts, apps/web/src/app/shared/ag-grid/tenant-aware-grid.component.ts, apps/web/src/app/shared/formly/gps-picker-leaflet.type.ts, apps/web/src/app/shared/formly/polygon-picker-leaflet.type.ts, apps/web/src/app/app.routes.ts</files>
  <read_first>
    - .planning/phases/01-foundation/01-CONTEXT.md (D-23, D-24, D-25, D-35 — activity log read-only on web)
    - .planning/phases/01-foundation/01-RESEARCH.md (apps/web structure)
  </read_first>
  <behavior>
    - Test (component): SitesListComponent renders AG-Grid with columns code, name, country, status; server-side datasource calls /api/sites with pagination params; clicking row routes to /sites/:id
    - Test (component): SiteFormComponent renders Formly form built from `site-form.schema.ts` — fields per D-24; GPS picker is Leaflet map with click-to-set marker; emits GeoJSON Point on submit
    - Test (component): ZoneFormComponent uses polygon-picker-leaflet (multiple click vertices → close polygon → GeoJSON Polygon)
    - Test (component): PermitFormComponent file input → calls /api/attachments first (presign) → PUTs to S3 URL → on success submits permit with sha256 reference
    - Test (component): ActivityLogListComponent reads /api/activity-log filtered by site_id query param; filter dropdown shows user's site_ids; columns: date, site, shift, author, notes, photo (link)
    - Test: SiteFormComponent disables submit button when form invalid (e.g., bad IANA tz)
    - Test: archive button visible only for DIRECTION_GROUPE and DIRECTEUR_SITE roles; clicking calls PATCH /api/sites/:id/archive and confirmation modal first
  </behavior>
  <action>
    `apps/web/src/app/shared/ag-grid/tenant-aware-grid.component.ts`: wraps `<ag-grid-angular>` with an Input `endpoint: string`; builds an `IServerSideDatasource` calling `httpClient.get(endpoint, {params: {offset, limit, sort, filter}})`; injects auth interceptor (added by plan 04). Returns `{rowData, rowCount}`.

    `apps/web/src/app/shared/formly/gps-picker-leaflet.type.ts`: custom Formly FieldType using `@asymmetrik/ngx-leaflet`. Map with default tile layer OSM; click → set marker → emit `{type:'Point', coordinates:[lng, lat]}` to formControl.

    `apps/web/src/app/shared/formly/polygon-picker-leaflet.type.ts`: similar; sequential clicks add vertices; double-click closes polygon; emits `{type:'Polygon', coordinates:[[[lng,lat],...]]}`.

    `features/sites/site-form.schema.ts`:
      ```ts
      export const siteFormSchema: FormlyFieldConfig[] = [
        { key: 'code', type: 'input', templateOptions: { label: 'sites.fields.code', required: true, pattern: '^[a-zA-Z0-9-_]{3,30}$' } },
        { key: 'name', type: 'input', templateOptions: { label: 'sites.fields.name', required: true } },
        { key: 'countryId', type: 'select', templateOptions: { label: 'sites.fields.country', required: true, options: countries$ } },
        { key: 'ianaTimezone', type: 'select', templateOptions: { label: 'sites.fields.timezone', required: true, options: IANA_TIMEZONES } },
        { key: 'functionalCurrency', type: 'select', templateOptions: { label: 'sites.fields.currency', required: true, options: ['XOF','XAF','EUR','USD'] } },
        { key: 'gpsPoint', type: 'gps-picker-leaflet', templateOptions: { label: 'sites.fields.gps', required: true } },
        { key: 'managerUserId', type: 'select', templateOptions: { label: 'sites.fields.manager', required: true, options: users$ } },
        { key: 'capacityTPerDay', type: 'input', templateOptions: { label: 'sites.fields.capacity', type: 'number', min: 0 } },
      ];
      ```
    Note that all labels reference i18n keys (Pitfall 9 — no inline strings).

    Build similar form schemas for zones, benches, permits.

    `features/sites/sites-list.component.ts` standalone component: uses `<gravel-tenant-aware-grid endpoint="/api/sites">`; toolbar with "+ New site" button (visible per role) routing to /sites/new.

    `features/sites/site-form.component.ts`: reads :id route param (or 'new'); fetches existing site via TanStack Query; uses Formly with siteFormSchema; on submit calls mutation POST or PATCH; on archive button click → confirm dialog → PATCH archive.

    Similar list+form pairs for zones (under /sites/:id/zones), benches (under /sites/:id/zones/:zoneId/benches), permits (under /sites/:id/permits).

    `features/activity-log/activity-log-list.component.ts`: read-only AG-Grid; columns date/site/shift/author/notes/photo. Site filter dropdown. Per D-35 visible only to roles DIRECTION_GROUPE and DIRECTEUR_SITE — guarded by `RoleGuard`.

    Update `app.routes.ts`:
      ```ts
      export const routes: Routes = [
        { path: 'login', component: LoginComponent },
        { path: '', canActivate: [authGuard], component: MainLayoutComponent, children: [
          { path: 'sites', loadChildren: () => import('./features/sites/sites.routes').then(m => m.SITE_ROUTES) },
          { path: 'activity-log', component: ActivityLogListComponent, canActivate: [roleGuard(['DIRECTION_GROUPE','DIRECTEUR_SITE'])] },
          ...
        ]},
      ];
      ```
  </action>
  <verify>
    <automated>pnpm --filter @gravel/web build && pnpm --filter @gravel/web test:quick</automated>
  </verify>
  <acceptance_criteria>
    - All list + form components compile and pass unit tests
    - Leaflet pickers emit valid GeoJSON
    - All labels reference i18n keys (no inline strings in *.html — grep gate)
    - archive button gated by role
    - activity-log route gated to 2 roles only
  </acceptance_criteria>
  <done>Web CRUD UI complete for master-data.</done>
</task>

<task type="auto" id="W2-P05-T03" tdd="true">
  <name>End-to-end test: site creation flow (FND-04)</name>
  <files>apps/web/e2e/site-create.e2e.ts</files>
  <read_first>
    - .planning/phases/01-foundation/01-CONTEXT.md (D-24 site fields, FND-04 success criterion)
    - .planning/phases/01-foundation/01-VALIDATION.md (FND-04 row)
  </read_first>
  <behavior>
    - E2E: dev user `directeur-site@gravel-dev` logs in via Keycloak (Playwright OIDC flow against running stack)
    - E2E: navigates to /sites → clicks "+ New site"
    - E2E: fills site-form (code 'CI-ABJ-01', name 'Carrière Abidjan Plateau', country=Côte d'Ivoire, timezone='Africa/Abidjan', currency='XOF', GPS = click on Leaflet at lat=5.345, lng=-4.024, manager dropdown selects current user, capacity 1500)
    - E2E: submits → toast success → redirected to /sites/:id detail
    - E2E: from detail, clicks "+ New zone" → polygon picker → submits zone "ZONE-A"
    - E2E: from zone, clicks "+ New bench" → submits "BENCH-1"
    - E2E: from site detail, clicks "+ New permit" → fills (type=exploitation, authority=DGMG, reference=PERM-2026-001, valid_from=today, valid_to=+5 years, document upload of a fixture PDF) → submits → permit appears in list
    - E2E: API response asserted via API tracing — POST /api/sites/POST /api/zones/POST /api/benches/POST /api/permits each returned 201
    - E2E: audit_log query confirms 4 INSERT rows (one per entity) with the correct actor
  </behavior>
  <action>
    `apps/web/e2e/site-create.e2e.ts`: replace stub. Use Playwright + a global setup that starts the full stack (Keycloak + Postgres + api + web) via docker compose OR connect to dev cluster. Persist auth state to a storage file after first login to speed up. Use Playwright's network tracing to assert API responses inline.

    Add a `apps/web/playwright.global-setup.ts` that ensures stack is up before tests; gracefully skip if not running locally (CI sets `FULL_STACK_AVAILABLE=true`).

    Use Playwright `page.locator` with data-testid attributes added to components in T02 — verify each component exposes the data-testids referenced here.
  </action>
  <verify>
    <automated>pnpm --filter @gravel/web exec -- playwright test e2e/site-create.e2e.ts</automated>
  </verify>
  <acceptance_criteria>
    - site-create.e2e.ts passes end-to-end against the running stack
    - All 4 entities created (site, zone, bench, permit)
    - audit_log query inside test confirms 4 INSERT rows for current actor
    - FND-04 verification command in 01-VALIDATION.md flips green
  </acceptance_criteria>
  <done>FND-04 success criterion #1 of ROADMAP green by E2E.</done>
</task>

</tasks>

<verification>
- master-data API tests green; soft-delete only enforced
- AG-Grid + Formly + Leaflet wired and rendering forms
- site-create.e2e.ts passes end-to-end
- FND-04 and FND-05 verification commands in 01-VALIDATION.md flip green
</verification>

<success_criteria>
- A real tenant admin can create a site, zones, benches, and permits via UI (FND-04, FND-05)
- The journal d'activité quotidien (from mobile via plan 03) is visible read-only on web
- No hard-delete code path anywhere
</success_criteria>

<output>
After completion create `.planning/phases/01-foundation/01-W3-P05-SUMMARY.md`.
</output>
