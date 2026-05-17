# Phase 6: Hardening, Scale & Multi-Country Rollout — Context

**Gathered:** 2026-05-17
**Status:** Ready for planning (v1.1-MVP slice only)
**Source:** discuss-phase 6 — scope split between v1.1 production-hardening MVP and v2 expansion/multi-region/IoT (delegated by user "prends toutes les meilleures options")

<domain>
## Phase Boundary

**Phase 6 is split into two scopes:**

### 6A — v1.1 Production-Hardening MVP (PLAN this now)
Hardening work that **genuinely blocks the first paying customer go-live** on Côte d'Ivoire. Eight focused tracks:

1. **Pen-test execution** — third-party (or internal red-team) test against the 3-layer RLS defense, AlertDispatcher, audit chain-of-hash, JWT→CLS→GUC middleware, and offline-sync proxy.
2. **Backup & PITR drill** — pgBackRest restore drill from S3-compatible target into a clean Postgres instance, end-to-end, with RTO/RPO measured.
3. **DR runbook + tabletop drill** — incident response playbook (DB loss, tenant compromise, region outage, sync deadletter pileup) + one annual tabletop.
4. **Secrets rotation procedure** — Keycloak admin password, JWT signing key, Brevo API key, Twilio creds, DB password, S3 access keys; encrypted history purge already shipped (P0-1, P0-2 from working tree).
5. **Per-tenant audit reports** — exportable audit chain verification per tenant per quarter (compliance for OHADA + future ISO).
6. **Production observability hardening** — SLO definitions (api p95 latency, sync success rate, queue drain rate, alert dispatch latency); Grafana dashboards + Prometheus alert rules pre-deployed.
7. **Mobile crash + sync chaos extension** — run the existing PowerSync chaos spec (FND-11) against a 1000-rotation synthetic load; document the deadletter triage SOP.
8. **Production deployment runbook** — first-customer cutover checklist: data migration from any legacy sources, user provisioning, training, day-1/day-7/day-30 review cadence.

### 6B — v2 Deferred Scope (DOCUMENT now, plan in v2 milestone)
Items explicitly NOT in v1.1 because no business driver yet (no signed second-country contract, no IoT hardware procured):

- **EXP-01..04** Multi-country expansion (per-country Keycloak realm bootstrap, OHADA country-specific tax/regulation packs, XOF↔XAF currency union readiness, second-country site provisioning workflow)
- **HRD-multi-region** Postgres logical replication to second AWS region (af-south-1 or eu-west-3) with read-only failover
- **HRD-active-active** Active-active multi-region (only if RPO/RTO demands — async replication is sufficient today per CLAUDE.md decision)
- **IOT-01/02/03** EMQX MQTT broker + edge gateway + Teltonika telematics adapter (per CLAUDE.md tech stack: deferred until first IoT contract; backend-only model exists today via Phase 5 verification)
- **SST-01/02** Service mesh (Istio/Linkerd) + microservice extraction (ADR Phase 6 "split when load demands" — load doesn't demand today)
- **HRD-multi-tenant-DB-per-tenant** Migration from RLS to per-tenant DB schemas (ADR-0005 documents the upgrade path; trigger is tenant_count > 50 or noisy-neighbor symptoms)

</domain>

<decisions>
## Implementation Decisions (v1.1-MVP only — Section 6A)

### Pen-test scope (D-HRD-01)
- **D-01:** Pen-test scope is OWASP Top 10 + application-layer + API auth/RBAC bypass attempts. Infrastructure (AWS/network/Kubernetes) pen-test is v2.
- **D-02:** Pen-test target is staging environment seeded with production-like data (synthetic). Production is out of scope to avoid RLS leak risk during testing.
- **D-03:** First pass = internal red-team (any team member acting adversarial against another's module) — cheap, fast, finds 80% of issues. Third-party pen-test is v2.
- **D-04:** Acceptance: zero CRITICAL findings, all HIGH findings have remediation tickets, MEDIUM/LOW logged in tech-debt backlog.

### Backup & PITR drill (D-HRD-02)
- **D-05:** Drill executes monthly automatically via GitHub Actions cron: spin up scratch Postgres, restore latest pgBackRest base + WAL to T-1h, run `pg_dump --schema-only` diff vs production schema, assert zero drift.
- **D-06:** RTO target = 1 hour restore. RPO target = 5 minutes (continuous WAL archive). Document gap if measured RTO/RPO exceeds.
- **D-07:** Restore artifacts (timing log, dump diff) committed to `.planning/drills/backup-YYYYMM.md` for audit trail.

### DR runbook + tabletop (D-HRD-03)
- **D-08:** Runbook covers 4 named scenarios: (1) primary DB total loss, (2) tenant data compromise (RLS leak), (3) AWS region outage, (4) BullMQ deadletter pileup blocking notifications.
- **D-09:** Each scenario has: detect-in-N-minutes signal, decision tree, communication template (to client + internal), recovery steps, post-mortem template.
- **D-10:** One annual tabletop drill (or before each major release). First tabletop = scenario #1 (DB loss) run before v1.1 cutover.

### Secrets rotation (D-HRD-04)
- **D-11:** Rotation procedures documented per secret type: Keycloak admin, JWT signing key, DB password, Brevo, Twilio, S3 access keys.
- **D-12:** Each procedure specifies: rotation cadence (Keycloak/DB = 90d, API keys = 180d, JWT key = 365d), rollout sequence (dual-key window for JWT), verification check.
- **D-13:** P0-1 (rotation checklist) and P0-2 (history purge script) are already in working tree — fold into this phase, don't re-do.

### Per-tenant audit export (D-HRD-05)
- **D-14:** Endpoint `GET /api/audit/export?tenant_id=X&from=Y&to=Z` returns: (a) full audit chain rows for the range, (b) hash-verification report per table, (c) compliance summary CSV.
- **D-15:** Verifies chain-of-hash integrity (ADR-0004) and flags any breaks. Output is signed (S3 presigned URL, 24h expiry).
- **D-16:** Quarterly cron emits the export per tenant automatically and emails the tenant's compliance contact.

### SLO + production observability (D-HRD-06)
- **D-17:** Four SLOs locked: (a) API p95 < 500ms (excluding analytics endpoints), (b) sync success rate > 99.5%/24h, (c) BullMQ queue drain < 10min for notifications, (d) alert dispatch latency p95 < 60s from event emit to email/SMS sent.
- **D-18:** Grafana dashboards: one per SLO + a top-level "production health" dashboard combining all four. Prometheus alerts fire on burn-rate (fast/slow burn) per Google SRE book.
- **D-19:** SLO breaches page on-call via PagerDuty (or equivalent free OSS like Grafana OnCall — must be FOSS per `feedback_free_tools_only`).

### Mobile + sync chaos extension (D-HRD-07)
- **D-20:** Extend FND-11 chaos spec to: 1000 synthetic rotations + 100 concurrent mobile clients + 30% random write-conflict injection. Measure: PowerSync deadletter rate, ConflictRegistry size, sync convergence time.
- **D-21:** Document the deadletter triage SOP — when an item lands in ConflictRegistry, what does a Chef Maintenance do? Where does it surface? Manual replay tool exists?
- **D-22:** Crash rate budget: < 0.5% sessions on the targeted rugged-Android device class (Crosscall / Caterpillar S62 / Ulefone Armor).

### Production cutover runbook (D-HRD-08)
- **D-23:** Cutover checklist published in `.planning/runbooks/v1.1-cutover.md`. Phases: pre-flight (T-7d), provisioning (T-1d), data load (T-0), user training (T+0), day-1/day-7/day-30 review.
- **D-24:** Data load: only master data (sites, users, equipment, suppliers) imported from CSV templates. No transactional history migration — clean start.
- **D-25:** User provisioning via Keycloak admin API + bulk role assignment script. Training material in FR (primary) + EN (for expat ops directors).

### Claude's Discretion
- Pen-test tooling (OWASP ZAP vs Burp Community vs Caido — pick FOSS).
- Specific Prometheus exporter selection where multiple exist.
- Chaos injection harness implementation (Toxiproxy / pumba / handwritten — whichever fits NestJS testing best).
- Runbook formatting (markdown table vs flowchart) — optimize for the engineer reading at 3am.
- Exact SLO measurement window (rolling 28d vs calendar month) — pick whichever is cheaper to compute in Prometheus.

### Folded Todos
None — no pending todos matched Phase 6 scope at discuss time.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture / Multi-tenant security
- `docs/adr/ADR-0001-rls-multi-tenancy.md` — 3-layer defense-in-depth (RLS + TenantAwareRepository + JWT→CLS→GUC); Phase 6 pen-test targets this stack
- `docs/adr/ADR-0005-db-per-tenant-upgrade-path.md` — the v2 migration plan from RLS to schema-per-tenant; documents trigger conditions
- `docs/adr/ADR-0004-audit-chain-of-hash.md` — per-(tenant,table) hash chain; audit export endpoint (D-HRD-05) verifies this

### Sync / Offline resilience
- `docs/adr/ADR-0002-powersync-sync-engine.md` — sync engine design; FND-11 chaos spec extends this
- `docs/adr/ADR-0009-weighing-ticket-offline-numbering.md` — offline numbering pattern that pen-test should attempt to break (race conditions, collision)

### Operational lifecycles (alert-bearing surfaces)
- `docs/adr/ADR-0010-sse-dashboard-push.md` — SSE push channel; SLO D-17 covers latency
- `docs/adr/ADR-0014-mnt-maintenance-lifecycle.md` — maintenance flows that Phase 8 PM scheduler drives; alert dispatch SLO covers end-to-end
- `docs/adr/ADR-0008-hse-incident-immutability-capa.md` — HSE incident immutability; pen-test must attempt to mutate

### Tech stack & operational constraints
- `CLAUDE.md` (project root) — full tech stack, OHADA constraints, "Modular monolith on day one, split per bounded context as load demands" — informs SST-01/02 deferral
- `.planning/PROJECT.md` — core value, validated requirements, "Phase 6 hardening" current state note

### Roadmap & milestone
- `.planning/ROADMAP.md` §Phase 6 — current placeholder scope (v2-deferred)
- `.planning/REQUIREMENTS.md` — v1.1 milestone scope (FIN/ALT/NTF only); Phase 6 v1.1-MVP REQs will be ADDED here as part of planning
- `.planning/MILESTONES.md` — milestone history

### Security / secrets baseline (already in working tree)
- `.gitignore` + git history purge script (`scripts/git-history-purge.*`) — P0-2 work
- `apps/api/.env.example` — secret surface inventory; rotation procedures cover each entry

### Backup tooling
- pgBackRest config (referenced in CLAUDE.md tech stack table) — drill procedure (D-05) runs against this
- AWS S3 (or MinIO self-hosted) — backup target

### Future v2 docs (NOT to read for v1.1-MVP planning — listed for v2 milestone)
- EMQX 5.x docs (IoT broker, deferred)
- Keycloak realm-per-country migration guide (deferred)
- Postgres logical replication setup (deferred)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`apps/api/src/modules/audit/`** — audit chain implementation; export endpoint (D-14) extends this module rather than creating a new one
- **`apps/api/src/modules/notification/`** (just shipped Phase 9) — BullMQ provider for cron jobs that need to dispatch (audit export emails, SLO breach alerts can reuse)
- **`apps/api/src/modules/master-data/keycloak-admin.service.ts`** (if exists; otherwise via raw Keycloak Admin API) — user provisioning bulk script (D-25) builds on this
- **`scripts/git-history-purge.*`** — P0-2 history purge; secrets rotation runbook (D-HRD-04) references this
- **Existing `tests/chaos/`** (FND-11 chaos spec location, if extracted from Phase 1) — extend for D-20 mobile chaos extension

### Established Patterns
- **Modular monolith with bounded-context modules** — don't introduce a new "hardening" module; spread D-14/D-19 endpoints into the modules that own the data (audit module owns export; notification module owns SLO alert dispatch)
- **All cross-cutting concerns via NestJS DI** — Prometheus metrics, OTel tracing already wired; SLO observability (D-HRD-06) adds dashboards + alerts, not new infrastructure
- **All secrets via env vars** — `apps/api/.env.example` is the canonical inventory; rotation procedures map 1:1 to env keys
- **All commits via `gsd-tools commit`** — drill artifacts (D-07) committed via the same path for audit traceability

### Integration Points
- **GitHub Actions** — monthly backup drill (D-05) runs here; pen-test report uploads as artifact
- **pgBackRest → S3** — restore target for drill
- **Grafana LGTM stack** — SLO dashboards (D-18) deployed here
- **Brevo email** — quarterly audit export delivery (D-16) reuses Phase 9 NotificationService
- **Keycloak Admin API** — user provisioning script (D-25)

</code_context>

<specifics>
## Specific Ideas

- **Drill artifacts are committed to repo** (`.planning/drills/backup-YYYYMM.md`, `.planning/drills/tabletop-YYYY.md`) — same pattern as ADRs; auditors can read history without S3 access.
- **Compliance contact per tenant** — add a `compliance_email` column to the `tenant` table during D-14 plan. Migration adds the column, defaulting to the tenant's billing contact. Audit export (D-16) reads from there.
- **"Production-like data" for pen-test** — generate with the existing `db:seed:demo` script, NOT a copy of production. RLS leak risk if production data ever touches staging.
- **OnCall tooling preference** — Grafana OnCall (FOSS, integrates natively with Grafana alerting) over PagerDuty (paid). Aligns with `feedback_free_tools_only`.

</specifics>

<deferred>
## Deferred Ideas (Phase 6B — v2 scope)

Everything in Section 6B above. To recap:

- **EXP-01..04** — multi-country: per-country Keycloak realms, OHADA country packs (CI = baseline; BF/ML/SN = each its own pack), XOF↔XAF readiness, second-country provisioning workflow.
- **HRD multi-region** — Postgres logical replication to second AWS region; read-only failover; runbook for promoting standby.
- **IOT-01/02/03** — EMQX broker, edge gateway, Teltonika telematics adapter. Wait for first IoT-equipped contract.
- **SST-01/02** — service mesh (Istio/Linkerd) + bounded-context microservice extraction. Trigger: load metrics from Phase 6A SLO dashboards show specific modules choking.
- **DB-per-tenant migration** — ADR-0005 documents the path; trigger is tenant_count > 50 OR noisy-neighbor symptoms in shared cluster.
- **Third-party pen-test** — internal red-team first (D-03); external firm is v2 spend.
- **Production AWS infra pen-test** — staging app-level only in v1.1.

### Reviewed Todos (not folded)
- None — no pending todos surfaced as matches for Phase 6 scope.

### Working tree items that should be committed BEFORE Phase 6 planning starts
- `scripts/git-history-purge.*` (P0-2) — secrets rotation runbook references this
- `.env.example` modifications (P0-1) — rotation checklist baseline
- Various test file `.spec.ts` updates (~14 files) — clean test state needed before pen-test baseline run

</deferred>

---

*Phase: 06-hardening-scale-multi-country-rollout*
*Context gathered: 2026-05-17 — scope split MVP (6A) / deferred-v2 (6B) per user direction "prends toutes les meilleures options"*
