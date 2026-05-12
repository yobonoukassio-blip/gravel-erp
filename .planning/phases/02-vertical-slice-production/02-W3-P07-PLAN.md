---
phase: 02-vertical-slice-production
plan: 07
type: execute
wave: 3
depends_on: ["02-W0-P01", "02-W2-P05"]
files_modified:
  - apps/api/src/modules/hse/hse.module.ts
  - apps/api/src/modules/hse/entities/hse-incident.entity.ts
  - apps/api/src/modules/hse/entities/corrective-action.entity.ts
  - apps/api/src/modules/hse/entities/hse-attachment.entity.ts
  - apps/api/src/modules/hse/services/hse-incident.service.ts
  - apps/api/src/modules/hse/services/corrective-action.service.ts
  - apps/api/src/modules/hse/services/hse-attachment.service.ts
  - apps/api/src/modules/hse/services/tf-calculator.service.ts
  - apps/api/src/modules/hse/controllers/hse-incident.controller.ts
  - apps/api/src/modules/hse/controllers/corrective-action.controller.ts
  - apps/api/src/modules/hse/migrations/1716500000000__create_hse_incident.sql
  - apps/api/src/modules/hse/migrations/1716500100000__create_hse_attachment.sql
  - apps/api/src/modules/hse/migrations/1716500200000__create_corrective_action.sql
  - apps/api/src/modules/hse/migrations/1716500300000__alter_operational_day_workforce_headcount.sql
  - apps/api/src/modules/hse/tests/hse-incident.spec.ts
  - apps/api/src/modules/hse/tests/corrective-action.spec.ts
  - apps/api/src/modules/hse/tests/tf-calculator.spec.ts
  - apps/api/src/modules/hse/tests/hse-incident-chain-integrity.spec.ts
  - apps/api/src/modules/hse/tests/s3-objectlock.spec.ts
  - apps/api/src/modules/hse/README.md
  - apps/web/src/app/features/hse/hse.module.ts
  - apps/web/src/app/features/hse/pages/incident-list.component.ts
  - apps/web/src/app/features/hse/pages/incident-detail.component.ts
  - apps/web/src/app/features/hse/pages/corrective-action-list.component.ts
  - apps/web/src/app/features/hse/hse-routes.ts
  - apps/mobile/lib/features/hse/screens/incident_form.dart
  - apps/mobile/lib/features/hse/screens/incident_list.dart
  - apps/mobile/lib/features/hse/repositories/incident_repository.dart
  - apps/mobile/integration_test/hse_incident_test.dart
  - docs/adr/ADR-0008-hse-incident-immutability-capa.md
  - docs/phase-03-handoff/hse-rh-deferred-scope.md
autonomous: true
requirements: [HSE-01, HSE-02, HSE-03, HSE-04, HSE-05, HSE-06]

must_haves:
  truths:
    - "Tout incident HSE est saisi append-only avec chain-of-hash et photos content-addressed S3 Object Lock 7y (HSE-01)"
    - "Un workflow CAPA est ouvert pour chaque incident et trackable jusqu'à clôture (HSE-02)"
    - "Un incident sévérité ≥ 4 ne peut pas être clôturé tant que ses CAPA ne sont pas verified"
    - "HSE-03 (EPI), HSE-04 (Habilitations), HSE-05 (Audit) sont DOCUMENTED-AS-DEFERRED en Phase 3 (stub artifacts présents)"
    - "Le KPI TF (taux fréquence) est calculé en temps réel avec proxy workforce_headcount (HSE-06)"
  artifacts:
    - path: "apps/api/src/modules/hse/entities/hse-incident.entity.ts"
      provides: "Append-only HseIncident with chain-of-hash"
    - path: "apps/api/src/modules/hse/services/tf-calculator.service.ts"
      provides: "TF (taux fréquence) = (accidents w/ lost-time × 1e6) / heures travaillées"
    - path: "docs/adr/ADR-0008-hse-incident-immutability-capa.md"
      provides: "Refined ADR (Accepted)"
    - path: "docs/phase-03-handoff/hse-rh-deferred-scope.md"
      provides: "Phase 3 hand-off for HSE-03/04/05 deferred scope"
    - path: "apps/api/src/modules/hse/README.md"
      provides: "Module README noting HSE-03/04/05 deferred"
  key_links:
    - from: "apps/api/src/modules/hse/services/hse-attachment.service.ts"
      to: "S3 HSE bucket (W0-P01 OpenTofu module)"
      via: "AWS SDK PutObject with content-addressed key (SHA-256 hex)"
      pattern: "PutObjectCommand"
    - from: "apps/api/src/modules/hse/services/hse-incident.service.ts"
      to: "alerts module (W0-P01)"
      via: "EventEmitter2 emit hse.incident.created"
      pattern: "hse\\.incident\\.created"
---

<objective>
Deliver HSE vertical slice covering HSE-01 (incident append-only + chain-of-hash + S3 Object Lock photos), HSE-02 (CAPA workflow), HSE-06 (TF KPI). Explicitly produce DEFERRED stub artifacts for HSE-03 (EPI), HSE-04 (Habilitations), HSE-05 (Audit) per D2-63/D2-64. Refine ADR-0008.

Output: HSE module backend + web list/detail + mobile incident form with photos + TF service + Phase 3 hand-off doc.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/02-vertical-slice-production/02-CONTEXT.md
@.planning/phases/02-vertical-slice-production/02-W0-P01-SUMMARY.md
@docs/adr/ADR-0008-hse-incident-immutability-capa.md
@infra/modules/s3-objectlock/main.tf
@apps/api/src/common/chain-of-hash/event-chain.verifier.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: HseIncident append-only + chain-of-hash + S3 Object Lock attachments + alert (HSE-01)</name>
  <files>
    apps/api/src/modules/hse/entities/hse-incident.entity.ts,
    apps/api/src/modules/hse/entities/hse-attachment.entity.ts,
    apps/api/src/modules/hse/services/hse-incident.service.ts,
    apps/api/src/modules/hse/services/hse-attachment.service.ts,
    apps/api/src/modules/hse/controllers/hse-incident.controller.ts,
    apps/api/src/modules/hse/migrations/1716500000000__create_hse_incident.sql,
    apps/api/src/modules/hse/migrations/1716500100000__create_hse_attachment.sql,
    apps/api/src/modules/hse/tests/hse-incident.spec.ts,
    apps/api/src/modules/hse/tests/hse-incident-chain-integrity.spec.ts,
    apps/api/src/modules/hse/tests/s3-objectlock.spec.ts
  </files>
  <read_first>
    - apps/api/src/modules/stockpile/entities/stockpile-event.entity.ts (W2-P05 chain-of-hash pattern)
    - apps/api/src/common/chain-of-hash/event-chain.verifier.ts (W0-P01)
    - infra/modules/s3-objectlock/main.tf (W0-P01 bucket module)
    - .planning/phases/02-vertical-slice-production/02-CONTEXT.md §"D2-60, D2-61"
  </read_first>
  <behavior>
    - HseIncident append-only — PATCH rejected. Corrections via HSE_INCIDENT_CHRONOLOGY_APPENDED event (separate row referencing original).
    - Each insert computes prev_hash + row_hash chain per tenant_id
    - 6 categories: accident_personnel, accident_materiel, near_miss, environnement, securite, autre
    - Severity 1-5
    - Photos uploaded: client computes SHA-256, requests pre-signed PUT URL, uploads, server validates received SHA matches, persists hse_attachment row with object_key = content hash
    - S3 PutObject uses ObjectLockMode='GOVERNANCE' + ObjectLockRetainUntilDate=now+7y
    - On insert emits `hse.incident.created` (consumed by alerts module)
  </behavior>
  <action>
    Migration `__create_hse_incident.sql`:
    `CREATE TYPE hse_category AS ENUM ('accident_personnel','accident_materiel','near_miss','environnement','securite','autre');
    CREATE TABLE hse_incident (id UUID PK DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL, site_id UUID NOT NULL, occurred_at_local TIMESTAMP NOT NULL, iana_timezone VARCHAR(64) NOT NULL, occurred_at_utc TIMESTAMPTZ NOT NULL, operational_day_id UUID NOT NULL REFERENCES operational_day(id), category hse_category NOT NULL, severity INT NOT NULL CHECK (severity BETWEEN 1 AND 5), reporter_user_id UUID NOT NULL, location_text VARCHAR(500) NOT NULL, gps_point GEOGRAPHY(POINT, 4326) NULL, people_impacted JSONB NOT NULL DEFAULT '[]', equipment_impacted_ids UUID[] NOT NULL DEFAULT '{}', chronology_md TEXT NOT NULL, status VARCHAR(30) NOT NULL DEFAULT 'open' CHECK (status IN ('open','under_investigation','closed')), prev_hash BYTEA NOT NULL, row_hash BYTEA NOT NULL, created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now())`. RLS. @SyncEntity append_only_event.

    Migration `__create_hse_attachment.sql`:
    `CREATE TABLE hse_attachment (id UUID PK DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL, incident_id UUID NOT NULL REFERENCES hse_incident(id), sha256_hex VARCHAR(64) NOT NULL, s3_bucket VARCHAR(100) NOT NULL, s3_object_key VARCHAR(200) NOT NULL, content_type VARCHAR(100) NOT NULL, size_bytes BIGINT NOT NULL, uploaded_by UUID NOT NULL, uploaded_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (tenant_id, incident_id, sha256_hex))`. RLS.

    `HseAttachmentService.requestUploadUrl(incidentId, sha256, contentType, sizeBytes)`: returns pre-signed PUT URL with `x-amz-object-lock-mode: GOVERNANCE`, `x-amz-object-lock-retain-until-date: <now+7y>`. After upload, client calls `confirmUpload` which HEAD-checks the object and inserts hse_attachment.

    `HseIncidentService.create(dto)`: insert with chain (mirror stockpile pattern), emit `hse.incident.created` with payload { incident_id, severity, category, site_id, tenant_id }.

    Specs:
    - hse-incident.spec: create 3 incidents → chain verified; PATCH /hse-incidents/:id → 405; emit `hse.incident.created` reaches alerts module (mock listener).
    - chain-integrity.spec: 100 incidents, EventChainVerifier.verifyChain('hse_incident', tenantId) → valid; inject corruption → valid=false.
    - s3-objectlock.spec: request upload URL → assert URL contains `x-amz-object-lock-mode=GOVERNANCE`; confirm with mismatched SHA → 400 ERR_HASH_MISMATCH.
  </action>
  <verify>
    <automated>pnpm --filter=@gravel/api test -- hse-incident hse-incident-chain-integrity s3-objectlock</automated>
  </verify>
  <acceptance_criteria>
    - Migration contains `CREATE TYPE hse_category AS ENUM ('accident_personnel','accident_materiel','near_miss','environnement','securite','autre')`
    - Migration contains `severity INT NOT NULL CHECK (severity BETWEEN 1 AND 5)`
    - Entity contains `prev_hash` and `row_hash` BYTEA
    - Attachment service contains `GOVERNANCE` and `7 year` retention reference
    - Spec asserts chain corruption detected by EventChainVerifier on hse_incident
    - Spec asserts emit `hse.incident.created`
    - `pnpm --filter=@gravel/api test hse-incident` exits 0
  </acceptance_criteria>
  <done>HSE-01 incident immutability + S3 Object Lock + chain-of-hash.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: CorrectiveAction workflow + severity≥4 closure guard (HSE-02)</name>
  <files>
    apps/api/src/modules/hse/entities/corrective-action.entity.ts,
    apps/api/src/modules/hse/services/corrective-action.service.ts,
    apps/api/src/modules/hse/controllers/corrective-action.controller.ts,
    apps/api/src/modules/hse/migrations/1716500200000__create_corrective_action.sql,
    apps/api/src/modules/hse/tests/corrective-action.spec.ts
  </files>
  <read_first>
    - apps/api/src/modules/hse/entities/hse-incident.entity.ts (Task 1)
    - apps/api/src/modules/audit/audit.module.ts (Phase 1 audit triggers — pattern for mutable+audit)
    - .planning/phases/02-vertical-slice-production/02-CONTEXT.md §"D2-62"
  </read_first>
  <behavior>
    - Statuses: open → in_progress → done → verified → closed
    - Status transitions audit-logged via @Auditable trigger
    - Cannot close (status='closed') an HseIncident if severity ≥ 4 AND any related CAPA.status != 'verified'
    - Assignment requires HSE_OFFICER or SITE_MANAGER role
    - closed_evidence_attachments: array of SHA-256 referencing hse_attachment rows
  </behavior>
  <action>
    Migration:
    `CREATE TYPE capa_status AS ENUM ('open','in_progress','done','verified','closed');
    CREATE TYPE capa_priority AS ENUM ('low','medium','high','critical');
    CREATE TABLE corrective_action (id UUID PK DEFAULT uuid_generate_v4(), tenant_id UUID NOT NULL, incident_id UUID NOT NULL REFERENCES hse_incident(id), description TEXT NOT NULL, assigned_to_user_id UUID NOT NULL, due_date_local DATE NOT NULL, iana_timezone VARCHAR(64) NOT NULL, priority capa_priority NOT NULL, status capa_status NOT NULL DEFAULT 'open', closed_evidence_attachments TEXT[] NOT NULL DEFAULT '{}', closed_at_utc TIMESTAMPTZ NULL, closed_by UUID NULL, verification_user_id UUID NULL, verified_at_utc TIMESTAMPTZ NULL, created_by UUID NOT NULL, created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT now())`. RLS. @Auditable.

    `CorrectiveActionService.transition(id, newStatus, userId)`: validate allowed transitions, role checks for verify (verification_user_id != closed_by). `HseIncidentService.close(incidentId, userId)`: if incident.severity >= 4, check `COUNT capa WHERE incident_id=X AND status != 'verified' === 0`; otherwise 400 ERR_CAPA_NOT_VERIFIED.

    Spec: create severity=5 incident + 2 CAPAs. Close incident → 400 ERR_CAPA_NOT_VERIFIED. Verify both CAPAs (state done→verified). Close incident → 200.
  </action>
  <verify>
    <automated>pnpm --filter=@gravel/api test -- corrective-action</automated>
  </verify>
  <acceptance_criteria>
    - Migration contains `CREATE TYPE capa_status AS ENUM ('open','in_progress','done','verified','closed')`
    - Service contains `ERR_CAPA_NOT_VERIFIED` for severity≥4 closure guard
    - Spec asserts severity 5 incident cannot close until CAPAs verified
    - `pnpm --filter=@gravel/api test corrective-action` exits 0
  </acceptance_criteria>
  <done>HSE-02 CAPA workflow with closure guard for severity ≥ 4.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: TF (taux fréquence) calculator + workforce_headcount on OperationalDay (HSE-06)</name>
  <files>
    apps/api/src/modules/hse/services/tf-calculator.service.ts,
    apps/api/src/modules/hse/migrations/1716500300000__alter_operational_day_workforce_headcount.sql,
    apps/api/src/modules/hse/tests/tf-calculator.spec.ts
  </files>
  <read_first>
    - apps/api/src/common/operational-day/operational-day.entity.ts (Phase 1)
    - apps/api/src/modules/hse/entities/hse-incident.entity.ts (Task 1)
    - .planning/phases/02-vertical-slice-production/02-CONTEXT.md §"D2-65 + specifics workforce_headcount"
  </read_first>
  <behavior>
    - TF formula: (incidents with lost_time × 1,000,000) / hours_worked
    - hours_worked Phase 2 = sum(operational_day.metadata.workforce_headcount * 8) over rolling 12 months
    - "incident with lost_time" = HseIncident WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(people_impacted) p WHERE (p->>'lost_time_h')::numeric > 0)
    - Service returns: { tf_rolling_12_months, tf_since_launch, hours_worked, accidents_with_lost_time, period_start, period_end }
    - If < 12 months of data: tf_since_launch (label change in UI)
  </behavior>
  <action>
    Migration `__alter_operational_day_workforce_headcount.sql`:
    `ALTER TABLE operational_day ADD COLUMN IF NOT EXISTS workforce_headcount INT NULL;` (metadata jsonb extension OR explicit column — choose explicit column for performance, with CHECK >= 0)

    `TfCalculatorService.compute(siteId, asOf: Date): { tf, hours_worked, accidents_count, mode: 'rolling_12m' | 'since_launch' }`. Query operational_day with workforce_headcount NOT NULL in window, sum * 8h. Query hse_incident WHERE EXISTS lost_time_h > 0. Apply formula. If window < 365 days available data, return mode='since_launch' with note in payload.

    Spec: seed 200 operational_days × 50 headcount × 8h = 80000 hours, 4 incidents with lost_time → TF = 4 × 1e6 / 80000 = 50. Assert tf=50. Test < 12 months window: assert mode='since_launch'.
  </action>
  <verify>
    <automated>pnpm --filter=@gravel/api test -- tf-calculator</automated>
  </verify>
  <acceptance_criteria>
    - Migration contains `ALTER TABLE operational_day ADD COLUMN` workforce_headcount
    - Service contains formula constant `1000000` or `1_000_000`
    - Service returns `mode: 'rolling_12m' | 'since_launch'`
    - Spec asserts canonical TF=50 calculation
    - `pnpm --filter=@gravel/api test tf-calculator` exits 0
  </acceptance_criteria>
  <done>HSE-06 TF calculator with rolling and since-launch modes.</done>
</task>

<task type="auto">
  <name>Task 4: Deferred-scope artifacts HSE-03/04/05 (stub docs + module README + Phase 3 hand-off)</name>
  <files>
    apps/api/src/modules/hse/README.md,
    docs/phase-03-handoff/hse-rh-deferred-scope.md
  </files>
  <read_first>
    - .planning/phases/02-vertical-slice-production/02-CONTEXT.md §"D2-63, D2-64"
    - .planning/REQUIREMENTS.md §"HSE-03, HSE-04, HSE-05"
  </read_first>
  <action>
    1. `apps/api/src/modules/hse/README.md`: document module scope; explicitly list:
       - "HSE-03 (EPI management): DEFERRED to Phase 3 RH module — no schema, no service in Phase 2"
       - "HSE-04 (Habilitations 'as-of'): DEFERRED to Phase 3 RH module — minimal carcass employee_certification only if pilot escalates"
       - "HSE-05 (Audit sécurité périodique): DEFERRED to Phase 3 — requires checklist + recurring planning + RH coupling"
       - Reference ADR-0008 Phase 2 vs Phase 3 boundary
    2. `docs/phase-03-handoff/hse-rh-deferred-scope.md`: 1-2 page doc detailing:
       - HSE-03 EPI: entities needed (`epi_item`, `epi_assignment`), workflows (issue, return, condition)
       - HSE-04 Habilitations: entities (`employee_certification` with `valid_from`/`valid_to`, `as_of` queries), bloquant rules
       - HSE-05 Audit: entities (`safety_audit_template`, `safety_audit_run`, `safety_audit_finding`), recurrence patterns
       - Phase 2 stub: none of these tables exist; if pilot escalates HSE-04, escalate as gap
       - Phase 3 hand-off owner: TBD
  </action>
  <verify>
    <automated>node -e "const fs=require('fs'); const r=fs.readFileSync('apps/api/src/modules/hse/README.md','utf8'); const h=fs.readFileSync('docs/phase-03-handoff/hse-rh-deferred-scope.md','utf8'); if(!r.includes('HSE-03')||!r.includes('HSE-04')||!r.includes('HSE-05')||!r.includes('DEFERRED')){console.error('README missing deferred markers');process.exit(1);} if(!h.includes('HSE-03')||!h.includes('HSE-04')||!h.includes('HSE-05')||!h.includes('Phase 3')){console.error('Hand-off missing');process.exit(1);}console.log('OK')"</automated>
  </verify>
  <acceptance_criteria>
    - `apps/api/src/modules/hse/README.md` contains strings `HSE-03`, `HSE-04`, `HSE-05`, `DEFERRED`
    - `docs/phase-03-handoff/hse-rh-deferred-scope.md` exists and references all 3 REQs + Phase 3
  </acceptance_criteria>
  <done>HSE-03/04/05 produce explicit deferred-stub artifacts per CONTEXT D2-63/D2-64.</done>
</task>

<task type="auto">
  <name>Task 5: Web HSE UI + Mobile incident form with photos</name>
  <files>
    apps/web/src/app/features/hse/hse.module.ts,
    apps/web/src/app/features/hse/hse-routes.ts,
    apps/web/src/app/features/hse/pages/incident-list.component.ts,
    apps/web/src/app/features/hse/pages/incident-list.component.html,
    apps/web/src/app/features/hse/pages/incident-detail.component.ts,
    apps/web/src/app/features/hse/pages/incident-detail.component.html,
    apps/web/src/app/features/hse/pages/corrective-action-list.component.ts,
    apps/web/src/app/features/hse/pages/corrective-action-list.component.html,
    apps/mobile/lib/features/hse/screens/incident_form.dart,
    apps/mobile/lib/features/hse/screens/incident_list.dart,
    apps/mobile/lib/features/hse/repositories/incident_repository.dart,
    apps/mobile/integration_test/hse_incident_test.dart,
    apps/api/src/modules/hse/hse.module.ts,
    apps/api/src/modules/hse/controllers/corrective-action.controller.ts
  </files>
  <read_first>
    - docs/design/phase-02/wireframes/hse-incident.png (W0-P01 workshop)
    - apps/mobile/lib/features/foration/screens/drilled_hole_form.dart (W1-P02 pattern)
    - apps/mobile/integration_test/_fixtures/mock_photo_blobs.dart (W0-P01)
    - .planning/phases/02-vertical-slice-production/02-CONTEXT.md §"D2-80, D2-81"
  </read_first>
  <action>
    Web:
    - incident-list: AG Grid columns category, severity (badge color), occurred_at, location, reporter, status, num_capas, num_attachments. Filter by date, category, severity, status.
    - incident-detail: read-only view with chronology_md rendered (markdown), people_impacted table, equipment_impacted list, attachments thumbnails (signed URLs), CAPA list inline with status badges.
    - corrective-action-list: AG Grid with description, incident_id, assignee, due_date, priority, status. Action buttons transition status (HSE_OFFICER role).

    Mobile incident_form: long form with: category (segmented), severity (1-5 stepper with color cue), location_text, GPS auto-captured, chronology_md (multi-line, supports markdown shortcuts), people_impacted (dynamic list — add row with employee, injury_type, body_part, lost_time_h), equipment_impacted (multi-select), photos (image_picker + compression to <2MB/1920px → SHA-256 → upload to pre-signed S3 URL). Confirmation modal "Incident immuable après envoi. Confirmer."

    Integration test hse_incident_test.dart: create incident offline (no photos in offline test, mocked), assert pending_sync row.
  </action>
  <verify>
    <automated>pnpm --filter=@gravel/web build &amp;&amp; cd apps/mobile &amp;&amp; flutter test integration_test/hse_incident_test.dart</automated>
  </verify>
  <acceptance_criteria>
    - `apps/web/src/app/features/hse/hse.module.ts` exports `class HseModule`
    - incident-detail.component.html renders markdown (e.g., `<markdown>` or pipe)
    - mobile `incident_form.dart` contains `category` and `severity` and `chronology_md`
    - mobile form contains `image_picker` and `flutter_image_compress` (or compression call)
    - Mobile integration test asserts pending_sync row
    - Build + flutter test exit 0
  </acceptance_criteria>
  <done>HSE web + mobile UI working end-to-end.</done>
</task>

<task type="auto">
  <name>Task 6: Refine ADR-0008 HSE incident immutability + CAPA</name>
  <files>docs/adr/ADR-0008-hse-incident-immutability-capa.md</files>
  <read_first>
    - docs/adr/ADR-0008-hse-incident-immutability-capa.md (W0-P01 draft)
    - apps/api/src/modules/hse/services/hse-incident.service.ts (Task 1)
    - apps/api/src/modules/hse/services/corrective-action.service.ts (Task 2)
  </read_first>
  <action>
    Promote to Accepted. Add `## Implementation Notes` covering: chain-of-hash columns, append-only enforcement, HSE_INCIDENT_CHRONOLOGY_APPENDED future pattern, S3 Object Lock Governance 7y, severity≥4 closure guard with CAPA verification, role split HSE_OFFICER/SITE_MANAGER, deferred HSE-03/04/05 cross-reference to hand-off doc.
  </action>
  <verify>
    <automated>node -e "const c=require('fs').readFileSync('docs/adr/ADR-0008-hse-incident-immutability-capa.md','utf8'); if(!c.includes('Accepted')||!c.includes('Implementation Notes')||!c.includes('GOVERNANCE')||!c.includes('severity')){console.error('missing');process.exit(1);}console.log('OK')"</automated>
  </verify>
  <acceptance_criteria>
    - ADR Status `Accepted`
    - ADR contains `## Implementation Notes`
    - ADR mentions `GOVERNANCE` and `severity` (closure guard)
  </acceptance_criteria>
  <done>ADR-0008 Accepted.</done>
</task>

</tasks>

<verification>
- All HSE tests green
- Chain-of-hash verified for hse_incident
- CAPA closure guard tested
- S3 Object Lock upload path tested
- TF calculator green
- Deferred-stub artifacts present for HSE-03/04/05
- ADR-0008 Accepted
</verification>

<success_criteria>
- HSE-01, HSE-02, HSE-06 fully covered
- HSE-03, HSE-04, HSE-05 documented as deferred with stub artifacts (README + hand-off doc)
</success_criteria>

<output>
After completion, create `.planning/phases/02-vertical-slice-production/02-W3-P07-SUMMARY.md`.
</output>
