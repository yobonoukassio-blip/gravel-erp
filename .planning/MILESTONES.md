# Milestones

## v1.1 Polish & Production-Hardening (Shipped: 2026-05-17)

**Phases completed:** 4 phases, 14 plans, 13+ tasks, 47 commits since v1.0 close (2026-05-16 → 2026-05-17)

**Goal:** Take v1.0 from code-complete to production-ready for first paying customer (Côte d'Ivoire). Two complementary tracks: close v1.0 audit gaps (real dashboard numbers + alerts that notify) and ship production-hardening MVP (pen-test, drills, SLOs, cutover).

**Key accomplishments:**

- **Phase 7 — Finance Real:** 7/7 cost components contributing (no more `0n` hardcodes), `CostPerTonAggregatorJob` daily @ 04:00 UTC materializing cost_per_ton_daily, DSH-04 HSE tiles + DSH-05 Group P&L drill-down, 5+ `alert_rule` rows seeded in migration. (FIN-R01, FIN-R02, FIN-R06 ✓; FIN-R03/R04/R05 UI tiles deferred to v1.2.)

- **Phase 8 — Operational Alerts Closure:** Equipment hour/km meter denormalization via event-driven `MeterUpdateHandler` (D-05/D-06), `PreventiveMaintenanceSchedulerJob` @Cron hourly with tenant fan-out + 3 interval paths (hours/km/days) + `findOpen` idempotency, `WorkOrderService.close()` advances PM plan state, spare-part threshold subscriber with severity-aware dedupe + recovery resolution. 31/31 unit tests. (ALT-01, ALT-02 ✓)

- **Phase 9 — Notification Delivery:** `NotificationModule` with BullMQ (5-retry exponential 30s base + DLQ via `UnrecoverableError`), Brevo email provider, Twilio SMS with per-recipient Redis sliding-window rate limit (3/h), in-app `Notification` entity + REST controller + Angular header badge with optimistic mark-as-read, dry-run safe by default (`NTF_DRY_RUN=true`). `AlertDispatcherService` `logger.log()` stubs fully eliminated. (NTF-01, NTF-02, NTF-03 ✓)

- **Phase 6 — Hardening MVP (Section 6A):** 8 production-hardening tracks shipped:
  - HRD-MVP-01 — Pen-test artifact set (procedure runbook + OWASP ZAP baseline + synthetic seed scripts + 2026-Q2 internal red-team SCOPE/FINDINGS/REMEDIATION templates + non-blocking session schedule)
  - HRD-MVP-02 — Monthly backup-PITR drill (pgBackRest restore + schema-diff scripts + GitHub Actions cron + 2026-05 baseline artifact, RTO 1h / RPO 5min targets)
  - HRD-MVP-03 — DR runbook (4 named P0 scenarios: DB loss, tenant compromise, region outage, BullMQ deadletter pileup) + 2026 tabletop drill template
  - HRD-MVP-04 — Secrets rotation runbook (6 secret families with cadence matrix, JWT dual-key window, ORDER MATTERS callout, 2026 rotation audit log)
  - HRD-MVP-05 — Per-tenant audit chain export endpoint (`GET /api/audit/export`) + quarterly cron auto-delivery via NotificationService + `tenant.compliance_email` migration (17/17 tests)
  - HRD-MVP-06 — 4 SLOs locked (API p95 <500ms, sync >99.5%, queue drain <10min, alert dispatch p95 <60s) + 5 Grafana dashboards + Prometheus burn-rate alerts (1h fast/6h slow per SRE Workbook) + custom NestJS metrics wired into SyncController and NotificationProcessor emitters + Grafana OnCall (FOSS) paging
  - HRD-MVP-07 — Extended sync chaos spec (1000×100×30% load) + deadletter triage SOP + manual replay endpoint (`POST /api/sync/deadletter/:id/replay`) + weekly chaos CI
  - HRD-MVP-08 — First-customer cutover runbook (T-7d/T-1d/T-0/T+0/day-1/7/30 gates) + 4 master-data CSV templates (sites, users, equipment, suppliers)

- **Section 6B deferred to v2:** Multi-country expansion (EXP-01..04), multi-region Postgres logical replication, IoT broker stack (EMQX + Kafka + TimescaleDB sink), service mesh (Istio/Linkerd) + microservice extraction, DB-per-tenant migration (ADR-0005), third-party pen-test, AWS infrastructure pen-test — full scope documented in `.planning/milestones/v1.1-phases/06-hardening-scale-multi-country-rollout/06-CONTEXT.md` for v2 milestone planning head-start.

**Test gate at close:** Unit suite passes (exit 0); pre-existing 18 modified files + ~14 untracked dev scripts unrelated to v1.1 scope.

### Known Gaps (carried to v1.2)

- **FIN-R03** Dashboard Finance Groupe (DSH-05) P&L drill-down UI — backend ready, Angular tile pending
- **FIN-R04** KPI Finance tiles (DSH-03: cout/tonne, marge, conso carburant, cout maintenance) on Directeur Site dashboard — backend ready, Angular tiles pending
- **FIN-R05** KPI HSE tiles (DSH-04: incidents, TF, conformite) on HSE dashboard — backend ready, Angular tiles pending

### Outside-scope shipped (bonus from working-tree)

- Local /auth/login HS256 path (FND-01 demo) coexisting with Keycloak RS256
- TIR-03 blast_plan canonical migration
- HSE-03 EPI module + Tir mobile list
- Dashboard "current" sentinel → user's siteId resolver interceptor

**Pre-cutover non-blocking parallel tracks:**
- 2026-Q2 internal red-team session execution (artifacts ready, scheduled)
- Brevo + Twilio production credentials (code dry-run safe; flip `NTF_DRY_RUN=false`)
- First automated monthly backup-drill GHA cron run

**Full archive:** [milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md) • [milestones/v1.1-REQUIREMENTS.md](milestones/v1.1-REQUIREMENTS.md)

---

## v1.0 MVP (Shipped: 2026-05-16)

**Phases completed:** 5 phases, 21 plans, 26 tasks, 237 commits, 107k LOC.

**Goal:** Foundation + vertical slice from exploration to BL/invoice + operational completeness for a single Côte d'Ivoire quarry, with offline-first mobile + multi-tenant defense-in-depth + audit chain integrity from day one.

**Key accomplishments:**

- **Phase 1 — Foundation:** Modular monolith NestJS 11 + Node 24 LTS + Postgres 18 + PostGIS 3.5 + TimescaleDB, 3-layer defense-in-depth (RLS + TenantAwareRepository + JWT→CLS→GUC, ADR-0001), audit chain-of-hash per-(tenant,table) (ADR-0004), Keycloak 26 single realm + groups per site (ADR-0005 db-per-tenant upgrade path documented), OperationalDay first-class entity with D-20 lint gate (ADR-0003), Flutter 3.35 + PowerSync + Drift + ConflictRegistry + chaos spec GREEN (ADR-0002), money in bigint minor units + dinero.js v2 multi-currency, OTel + Grafana LGTM observability self-hosted.

- **Phase 2 — Vertical Slice Production:** End-to-end from exploration → foration plan + GPS holes → tir de mine blast plan saga (ADR-0012) → extraction cycles → transport with offline weighing tickets + SHA-256 content-hash (ADR-0009) → stockpile event-sourced inventory with chain-of-hash + RANGE-partitioned monthly tables (ADR-0006) → fuel event-sourced reconciliation (ADR-0007) → vente BL → invoice with FX freeze (ADR-0015).

- **Phase 3 — Operational Completeness:** HSE incident immutability + CAPA (ADR-0008), RH habilitations as-of pattern (ADR-0011), MNT maintenance lifecycle with PM plans + WorkOrders (ADR-0014), CON/CRI crusher+screening session consumers feeding stockpile (ADR-0013), explosives_event partitioned append-only ledger, employee unified model.

- **Phase 4 — Analytics Consolidation + Finance backend:** FIN-01 cost-per-ton aggregator backend services, analytical_entry write-path, real-time SSE dashboard broadcaster with Last-Event-ID replay (ADR-0010), two persona dashboards (Directeur Site + Chef Carrière) with AG Grid alerts inbox + Leaflet site map, fuel-only `cost_per_ton_provisional` service with hard "Provisoire" UI guardrail (D2-100), Playwright e2e proving 10s end-to-end live update.

- **Phase 5 — IoT Ingestion Model:** Edge ingestion + bulk backfill model (IOT-01); full MQTT broker + edge gateway + Teltonika adapter deferred to v2 per tech-debt audit.

**Full archive:** [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md) • [milestones/v1.0-REQUIREMENTS.md](milestones/v1.0-REQUIREMENTS.md) • [milestones/v1.0-MILESTONE-AUDIT.md](milestones/v1.0-MILESTONE-AUDIT.md)
