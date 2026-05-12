# Architecture Research

**Domain:** Mining/Quarry ERP — Multi-site, multi-country granite operations with offline mobile, IoT ingestion, real-time dashboards, and consolidated group reporting
**Researched:** 2026-05-12
**Confidence:** HIGH (mining ERP architectural patterns are well-documented across Hexagon/HxGN, Sandvik, MineSense, MICROMINE, and modern mining-tech case studies; offline sync patterns are mature in PouchDB/CouchDB, WatermelonDB, and PowerSync literature; IoT ingestion patterns are standard Lambda Architecture)

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                       CLIENT / EDGE LAYER                             │
├──────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │
│  │  Web App     │  │ Mobile App   │  │ Site Gateway │  │  IoT     │ │
│  │  (React/SPA) │  │ (Flutter)    │  │ (Edge K3s)   │  │  Devices │ │
│  │  HQ/Finance  │  │ Offline-first│  │ Local cache  │  │  MQTT    │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └─────┬────┘ │
│         │                 │ Sync             │ Buffer/Relay   │      │
├─────────┴─────────────────┴──────────────────┴────────────────┴──────┤
│                       API GATEWAY / BFF                               │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Kong/Traefik + Auth (Keycloak/OIDC) + Rate limit + Tenant ctx │ │
│  └────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────┤
│                  DOMAIN SERVICES (Bounded Contexts)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │ Production  │  │ Equipment   │  │ Inventory & │  │ Sales &    │ │
│  │ (Drill/Blast│  │ & Maint.    │  │ Stockpile   │  │ Shipping   │ │
│  │ Extract/Crush│ │ (CMMS)      │  │             │  │            │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │ HSE         │  │ HR & Time   │  │ Fuel/Energy │  │ Finance/   │ │
│  │ (Incidents) │  │ Attendance  │  │             │  │ Cost/Tonne │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Cross-cutting: Identity/RBAC · Master Data · Notifications  │   │
│  └─────────────────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────────────────┤
│                EVENT BUS / INTEGRATION BACKBONE                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Kafka / Redpanda  (domain events, IoT telemetry, CDC stream)  │ │
│  └────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────┤
│              STREAM / IOT PROCESSING                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────┐   │
│  │ MQTT Broker  │→ │ Stream Proc. │→ │ Hot store (Timescale/    │   │
│  │ (EMQX/HiveMQ)│  │ (Kafka       │  │ InfluxDB) — telemetry    │   │
│  │ + Edge buffer│  │ Streams/Flink│  │ Cold store (S3/Parquet)  │   │
│  └──────────────┘  └──────────────┘  └─────────────────────────┘   │
├──────────────────────────────────────────────────────────────────────┤
│           OPERATIONAL DATA STORES (per service)                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ PostgreSQL (PostGIS) — row-level multi-tenant per service     │  │
│  │ TimescaleDB — IoT/sensor time-series                          │  │
│  │ Redis — cache, sessions, rate limits                          │  │
│  │ Object store (S3/MinIO) — photos, BL PDFs, attachments        │  │
│  └──────────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────┤
│           ANALYTICS / CONSOLIDATED REPORTING                          │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ CDC (Debezium) → Data Lake (S3/Parquet) → Warehouse           │  │
│  │ (ClickHouse / DuckDB / BigQuery) → Semantic layer (dbt/Cube)  │  │
│  │ → BI (Metabase/Superset) + Group consolidation views          │  │
│  └──────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| API Gateway | TLS termination, auth, tenant context injection, rate limiting | Kong / Traefik / Envoy |
| Identity & RBAC | Users, roles, site/tenant scoping, SSO, audit | Keycloak (OIDC + group claims) |
| Master Data Service | Sites, zones, benches, equipment registry, materials catalog, GPS perimeters | NestJS/Spring + PostGIS |
| Production Context | Drilling, blasting, extraction, crushing, screening — operational events | Service-per-subdomain or modular monolith |
| Equipment & Maintenance | Asset registry, work orders, preventive plans, spare parts, downtime | CMMS-style service |
| Inventory & Stockpile | Real-time stockpile volumes by calibre, transfers, valuation | Event-sourced ledger preferred |
| Sales & Shipping | Contracts, BL, weighbridge tickets, invoicing, customs export | PostgreSQL + numbered docs |
| HSE | Incidents, near-miss, PPE, audits, corrective actions, training | PostgreSQL + workflow engine |
| HR / Time | Employees, shifts, badge-in, contractors, certifications | Integrate via export to SIRH |
| Fuel & Energy | Tank levels, refuelings, anomalies, electrical metering | Time-series + reconciliation |
| Finance / Cost-to-tonne | Analytical accounting, cost allocation, multi-currency, consolidation | Double-entry analytical ledger |
| IoT Ingestion | Telematics, fuel sensors, weighbridges, vibration probes | MQTT + Kafka + Timescale |
| Sync Service | Offline mobile reconciliation, conflict resolution, delta push | PowerSync / Electric / custom CRDT |
| Notifications | Alerts, push, SMS, email — operational & HSE | Service + provider (Firebase/Twilio) |
| Analytics / Reporting | Group consolidation, KPI dashboards, cost-per-tonne | Warehouse + BI tool |

## Recommended Project Structure

```
gravel-ivoire/
├── apps/
│   ├── web/                       # React/Next SPA — desk users
│   ├── mobile/                    # Flutter — field workers (offline-first)
│   ├── edge-gateway/              # Site-local relay (Docker on small NUC/K3s)
│   └── api-gateway/               # Kong/Traefik config + BFF
├── services/
│   ├── identity/                  # Keycloak extensions, tenant claims
│   ├── master-data/               # Sites, equipment, materials, geospatial
│   ├── production-drilling/       # Drilling plans, hole data
│   ├── production-blasting/       # Blast plans, explosives, HSE gates
│   ├── production-extraction/     # Excavators, loaders, yield
│   ├── production-haulage/        # Fleet rotations, weighbridge, dispatch
│   ├── production-crushing/       # Crusher KPIs, alarms
│   ├── production-screening/      # Calibres, quality, non-conformities
│   ├── inventory-stockpile/       # Stockpile ledger (event-sourced)
│   ├── sales-shipping/            # Contracts, BL, invoicing, customs
│   ├── maintenance/               # CMMS — WO, PM, spares
│   ├── fuel-energy/               # Tanks, refuelings, anomalies
│   ├── hse/                       # Incidents, PPE, audits
│   ├── hr-time/                   # Employees, shifts, attendance
│   ├── finance-analytics/         # Cost/tonne, P&L per site
│   ├── sync/                      # Mobile delta sync + conflict resolver
│   ├── iot-ingestion/             # MQTT consumer → Kafka → Timescale
│   └── notifications/             # Push/SMS/email dispatcher
├── platform/
│   ├── events/                    # Avro/Protobuf schemas, contract tests
│   ├── shared-kernel/             # Money, Tenant, SiteId, AuditTrail
│   ├── observability/             # OTel, Prometheus, Grafana dashboards
│   └── infra/                     # Terraform, Helm charts, ArgoCD
├── analytics/
│   ├── dbt/                       # Models, marts, semantic layer
│   ├── debezium/                  # CDC connectors per service DB
│   └── warehouse/                 # ClickHouse schemas
└── docs/                          # ADRs, runbooks, API specs
```

### Structure Rationale

- **apps/ vs services/:** Front-ends and edge components are deployed separately from backend services — different release cadences, different teams.
- **services/ split by bounded context, not by entity:** Each service owns its database. Production subdomains are split because drilling and blasting have very different lifecycles, regulators, and data models; haulage is naturally a different cadence (high-frequency events).
- **inventory-stockpile separate from production:** Stockpile is the integration point between extraction and sales; isolating it allows event-sourced ledger semantics without polluting transactional services.
- **sync/ as a dedicated service:** Offline reconciliation logic is cross-cutting; embedding it in each service creates inconsistency. A dedicated service owns the sync protocol and conflict policies.
- **platform/events:** Single source of truth for event schemas. Mining ERPs fail when teams diverge on tonnage units, timestamps, or tenant identifiers.
- **analytics/ outside services/:** Analytical workload must not couple to operational deploy cycles. CDC + warehouse keeps producers ignorant of consumers.

## Architectural Patterns

### Pattern 1: Modular Monolith → Bounded-Context Microservices (Strangler)

**What:** Start with a single deployable backend organized internally as strict modules matching the bounded contexts above. Extract a module into its own service only when (a) it has a different scaling profile (IoT, sync) or (b) team boundaries require independent deploys.
**When to use:** Greenfield ERP with one team. Premature microservices in mining ERP is the #1 failure mode.
**Trade-offs:** Modular monolith ships faster, gives clean seams later. Premature splits cost 3-6 months of plumbing before any production value.

**Example seam:**
```typescript
// services/production-drilling/src/api.ts — internal module API
export interface DrillingService {
  recordHole(cmd: RecordHoleCommand): Promise<HoleId>;
  getPattern(patternId: PatternId): Promise<DrillPattern>;
}
// Other modules call via this interface today; tomorrow it's an HTTP/gRPC boundary.
```

### Pattern 2: Offline-First Sync via Server-Authoritative Delta + Per-Entity Conflict Policy

**What:** Mobile clients maintain a local SQLite (Drift/Isar in Flutter). Each row carries `tenant_id`, `site_id`, `client_id`, `client_seq`, `updated_at`, `version`. Sync is a two-phase exchange: (1) client pushes pending mutations as an ordered log; (2) server returns accepted operations + delta of changes since last `server_cursor`. Conflicts are resolved per entity type, not globally.

**Conflict policies by entity:**
- **Append-only events** (drill hole logged, refueling, blast shot, HSE incident, weighbridge ticket): no conflict possible — server accepts, assigns canonical ID, dedupes via `(client_id, client_seq)`.
- **Mutable master data** edited by one role at a time (work order status, employee shift): last-write-wins with `updated_at` and audit trail of overwrites.
- **Stockpile / fuel inventory** (concurrent modification possible): event-sourced — clients submit deltas (`+12.4t calibre 0/4`), server folds in order, never overwrites.
- **Plans** (drill pattern, blast plan): pessimistic — checkout/check-in with explicit lock; refuse offline edits if someone else holds the lock.

**When to use:** Mining/field domains where most field activity is event capture, not collaborative editing. CRDTs are over-engineering for 90% of this workload.

**Trade-offs:**
- Pros: simple to reason about; auditable; works on cheap Android; libraries exist (PowerSync, ElectricSQL, WatermelonDB, Couchbase Lite).
- Cons: requires discipline in modeling each entity as append-only or master data; needs explicit conflict UI for the pessimistic cases.

**Why not pure CRDT:** CRDTs (Yjs, Automerge) shine for collaborative documents. For tonnage ledgers and HSE incidents you need a canonical authority (regulatory audit). CRDTs add payload bloat and complicate financial reconciliation.

**Why not last-write-wins everywhere:** Two trucks weigh-bridging in parallel offline would silently overwrite each other. Stockpile drift compounds. Unacceptable for cost-per-tonne accuracy.

**Example client sync envelope:**
```json
{
  "client_id": "tablet-CI-Site2-12",
  "tenant_id": "gravel-ivoire",
  "since_cursor": "2026-05-12T07:14:22Z#9831",
  "pending": [
    {"op":"append","entity":"weighbridge_ticket","client_seq":418,"data":{...}},
    {"op":"delta","entity":"stockpile","client_seq":419,"data":{"calibre":"0/4","kg":+12400}},
    {"op":"upsert","entity":"work_order","client_seq":420,"version":7,"data":{...}}
  ]
}
```

### Pattern 3: Lambda-Style IoT Ingestion (Hot Path + Cold Path)

**What:** Sensors publish MQTT to a local broker at each site (edge gateway). Edge buffers when WAN drops and forwards to central Kafka. A stream processor writes (a) hot aggregates to TimescaleDB for live dashboards (b) raw events to S3/Parquet for analytical replay.

**When to use:** Any time IoT volume exceeds ~100 events/sec or live dashboards are required. Mining telematics easily hits 10k events/min across a multi-site group.

**Trade-offs:** Two storage paths to maintain. The benefit — dashboards stay sub-second while analytics retains raw fidelity — is essential for cost-per-tonne attribution.

**Edge gateway pattern:** A small Docker host at each quarry runs MQTT + Kafka MirrorMaker (or Redpanda Edge). When WAN dies, telemetry queues locally for up to 7 days; on reconnect it backfills.

### Pattern 4: Row-Level Multi-Tenancy with Site-Scoped RBAC

**What:** Single PostgreSQL per service, `tenant_id` column on every table, enforced by PostgreSQL Row-Level Security (RLS) policies bound to a connection-level GUC (`SET app.tenant_id = ...`). Site-level scoping is a second RLS predicate (`app.site_ids`) populated from the Keycloak token at gateway level.

**When to use:** SaaS-style ERP serving multiple legal entities (Gravel Ivoire + future operators) where data must be strictly isolated but operational cost must stay low.

**Trade-offs:**
- vs schema-per-tenant: simpler migrations, much lower connection/memory cost, but mistakes in RLS = catastrophic data leak. Mitigate with mandatory tests on every query path.
- vs DB-per-tenant: keep DB-per-tenant available as an upgrade for VIP customers requiring physical isolation (regulators, large groups). Architecture allows promoting a tenant later.

**Recommendation for Gravel Ivoire V1:** Row-level multi-tenancy with RLS, with an explicit ADR documenting the upgrade path to DB-per-tenant for enterprise customers.

### Pattern 5: Event-Sourced Stockpile Ledger

**What:** Stockpile is the most contested entity (extraction adds, screening reclassifies, sales removes, transfer moves). Store stockpile state as an immutable sequence of events. Current quantity is a fold; historical snapshots are queries.

**Why:** Mining ERPs that store stockpile as a mutable `quantity` field always drift. Event sourcing aligns with the operational reality and gives free audit.

**Trade-offs:** Engineering overhead is real. Apply event sourcing only to stockpile and fuel ledgers — not as a global architecture.

### Pattern 6: CDC-Based Analytics Plane

**What:** Debezium streams every operational DB change to Kafka. Sink connectors land Parquet in S3/MinIO. dbt models build warehouse marts in ClickHouse. Cube.dev or a semantic layer exposes consolidated KPIs to dashboards.

**When:** Mandatory once you have multi-site/multi-country consolidation. Querying operational DBs for group reporting at month-end kills production.

## Data Flow

### Operational Flow (Field → Server)

```
Field worker on tablet (offline)
  ↓ writes to local SQLite (Drift)
  ↓ sync envelope on next connection
Sync Service (validates, dedupes by client_seq, applies conflict policy)
  ↓ commits to service DB (Production / Maintenance / HSE / ...)
  ↓ emits domain event to Kafka
Downstream consumers:
  - Notifications service (alert HSE manager, dispatcher)
  - Inventory ledger (fold stockpile delta)
  - Analytics CDC stream (warehouse)
  ↓
Real-time dashboard (web) via WebSocket / SSE push
```

### IoT Flow (Sensor → Dashboard)

```
GPS/Fuel/Weighbridge sensor
  ↓ MQTT
Edge gateway broker (per site, buffers offline)
  ↓ MirrorMaker over VPN
Central Kafka (topic: telemetry.<type>)
  ↓                      ↓
Stream processor      Raw archive (S3 Parquet)
  ↓
TimescaleDB hot store
  ↓
Live dashboard (Grafana / custom) + alert rules
```

### Consolidation Flow (Site → Group Reporting)

```
All service DBs
  ↓ Debezium CDC
Kafka (change streams)
  ↓
Data Lake (S3, partitioned by tenant/site/date)
  ↓ dbt scheduled
Warehouse (ClickHouse)
  ↓
Semantic layer (Cube / dbt metrics) — handles multi-currency conversion,
  cost-per-tonne formulas, calendar alignment across countries
  ↓
BI tool (Metabase/Superset) + Group exec dashboard
```

### Key Data Flows

1. **Cost-per-tonne calculation:** weighbridge tickets (sales-shipping) + extraction events (production) + fuel refuelings (fuel-energy) + maintenance WO costs (maintenance) + labor hours (hr-time) → all CDC'd into warehouse → dbt model joins per site per period → multi-currency converted at semantic layer → consolidated to group in EUR/XOF.
2. **Real-time stockpile:** extraction "tons-produced" events + screening "reclassified" events + shipping "tons-loaded" events → stockpile event-sourced ledger → projection materialized in Redis for sub-100ms reads → web/mobile dashboards.
3. **HSE escalation:** mobile incident report (offline-capable) → sync → HSE service → workflow engine → notifications (push to site director, email to group HSE) → audit trail immutable.
4. **Blast clearance gate:** blasting service requires HSE service to confirm zone evacuation + maintenance to confirm equipment clear → orchestrated via saga/process manager, not via direct service-to-service calls.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 site, ~50 users, ~10 tablets | Modular monolith + single Postgres + single Kafka broker + one Timescale. No CDC yet — analytics can hit a read replica. |
| 3-5 sites, ~300 users, ~50 tablets, 1 country | Extract IoT ingestion and sync service. Add Debezium + warehouse. Edge gateways per site. Postgres read replicas. |
| 10+ sites, multi-country, ~1500 users | Extract production/maintenance/sales/finance into separate services. Per-region Kafka clusters with MirrorMaker. Tenant sharding if a single tenant outgrows shared infra. |

### Scaling Priorities

1. **First bottleneck:** sync throughput at shift change. 50 tablets pushing 8h of buffered data simultaneously at 7am crushes a naive sync endpoint. Mitigate with bounded payload size, gzip, server-side queue, and stagger windows.
2. **Second bottleneck:** analytical queries on the OLTP DB. Push to warehouse before month-end reporting. Never let finance run group consolidation against production Postgres.
3. **Third bottleneck:** IoT volume on the central Kafka if telematics frequency increases (e.g., GPS every 5s × 80 trucks). Solve with edge pre-aggregation, not bigger brokers.

## Anti-Patterns

### Anti-Pattern 1: One Shared Database for All Modules

**What people do:** Single Postgres with 400 tables, every module reads/writes every other module's tables directly.
**Why it's wrong:** Coupling becomes invisible. Schema changes block teams. Multi-tenant RLS becomes impossible to audit. Mining ERP vendors that started here (think legacy on-prem) cannot ship multi-tenant SaaS without a full rewrite.
**Do this instead:** One DB-per-service (or per-bounded-context inside a modular monolith). Cross-module data via events or explicit APIs.

### Anti-Pattern 2: CRDTs Everywhere "Because Offline"

**What people do:** Adopt Yjs/Automerge for the whole data model under the assumption that CRDTs solve sync.
**Why it's wrong:** Tonnage ledgers, financial transactions, and HSE records need server authority and immutable audit. CRDTs add payload and complicate regulator-facing audit trails.
**Do this instead:** Server-authoritative delta sync with per-entity conflict policy (Pattern 2). Reserve CRDTs for genuinely collaborative artifacts (rare in mining ERP).

### Anti-Pattern 3: Microservices on Day One

**What people do:** Split into 18 microservices before any user has logged in.
**Why it's wrong:** Domain boundaries are wrong on day one. You spend 6 months on Kafka/K8s/service mesh before delivering a single tonne of granite. Industry case studies (Segment, Istio adoption postmortems) repeatedly show modular monolith → strangler migration outperforms.
**Do this instead:** Modular monolith with strict internal boundaries. Extract services as proven scaling/team needs emerge.

### Anti-Pattern 4: Direct Service-to-Service Synchronous Calls for Cross-Domain Workflows

**What people do:** Blasting calls HSE which calls Maintenance which calls Production, all via REST. One slow service hangs the whole chain.
**Why it's wrong:** Cascading failures. Hard to test. Hard to evolve.
**Do this instead:** Process manager / saga pattern for cross-domain workflows. Domain events on Kafka for fan-out.

### Anti-Pattern 5: Storing IoT Telemetry in OLTP Postgres

**What people do:** Append every GPS ping to a `vehicle_positions` table.
**Why it's wrong:** Postgres bloats, vacuum struggles, queries slow down operational features.
**Do this instead:** TimescaleDB or InfluxDB as a separate store. Reference vehicles by ID; never join across.

### Anti-Pattern 6: Free-Text Tenant Routing in Application Code

**What people do:** Every query begins with `WHERE tenant_id = ?`, enforced by code review.
**Why it's wrong:** One missed `WHERE` = cross-tenant leak. Catastrophic in mining (rival operators).
**Do this instead:** PostgreSQL RLS policies bound to a session GUC. Tenant context is set by the gateway from JWT claims; application code cannot bypass it.

### Anti-Pattern 7: Building HR/Payroll Inside the ERP

**What people do:** Try to compete with dedicated SIRH for payroll.
**Why it's wrong:** Payroll is regulator-specific per country (OHADA, CNPS, fiscal). 5x the engineering for 0 mining differentiation.
**Do this instead:** Export attendance/time to a SIRH. Keep HR module focused on competencies, certifications, shift planning.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Telematics providers (Geotab/Samsara/local) | MQTT bridge or REST poll → Kafka topic | Normalize to canonical schema at ingestion |
| Fuel sensors (Endress+Hauser, Banlaw) | MQTT / Modbus via edge gateway | Reconcile sensor reading vs manual refueling slip |
| Weighbridge (Mettler Toledo, Avery) | Serial/TCP at site → edge service → events | Tickets are append-only; print + sign locally |
| Accounting (Sage, Sage X3, Odoo) | Batch export (CSV/FEC) + journal API | OHADA-compliant chart of accounts mapping |
| SIRH / Payroll | Batch export of hours + contractors | Avoid live integration; weekly export is fine |
| Customs (TradeNet CI, etc.) | Export-document generator + EDI where available | Country-specific adapter |
| SMS/Push (Twilio, Firebase, Africa's Talking) | Notifications service abstraction | Africa's Talking for Francophone Africa coverage |
| SSO (customer AD/Azure AD) | OIDC via Keycloak federation | Optional per tenant |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Mobile ↔ Sync service | HTTPS POST sync envelope + WebSocket for push | Token-scoped to tenant + site |
| Sync service ↔ Domain services | Internal API or events | Sync writes through domain validation, never directly to DB |
| Domain service ↔ Domain service | Domain events on Kafka (preferred) / REST for queries | Saga/process manager for multi-step workflows |
| IoT ingestion ↔ Domain services | Events on Kafka (vehicle.position, fuel.reading) | Domain services subscribe; never query Timescale directly |
| Operational ↔ Analytics | Debezium CDC → warehouse | One-way, eventual consistency, never read back |
| Edge gateway ↔ Central cluster | MQTT bridge / Kafka MirrorMaker over VPN | Buffer up to 7 days offline |

## Identity, Auth, and RBAC Strategy

- **IdP:** Keycloak self-hosted (open source, OIDC, federation, group claims). Alternative: Auth0/Cognito if managed is preferred.
- **Tokens:** OIDC access tokens carry `tenant_id`, `site_ids[]`, `roles[]`, `permissions[]` as claims. Short-lived (15min) + refresh tokens.
- **RBAC model:** Role + Site scope. A user is granted (Role, SiteId) tuples. Example: `("ChefCarriere", "site-yamoussoukro")`. Roles map to permission sets (drilling.write, hse.read, finance.read_consolidated).
- **Direction Groupe** gets a special claim `scope=group` that bypasses site scoping for read-only consolidated views, never for writes.
- **Multi-site users** (auditors, regional managers): multiple (Role, Site) tuples in the same token.
- **Field workers:** PIN-based unlock on shared tablets after initial device enrollment. Tablet holds a long-lived device token bound to a site.
- **Audit:** every mutation persists `actor_user_id`, `actor_role`, `tenant_id`, `site_id`, `client_id`, `ip`, `timestamp`. Audit log is append-only in a separate Postgres schema; CDC'd to immutable cold storage.

## Suggested Build Order (Feeds Roadmap Phasing)

**Phase 1 — Foundation (must precede everything):**
1. Multi-tenant data model with RLS, Keycloak, gateway, audit framework
2. Master Data service (sites, equipment, materials, users, roles)
3. Notifications skeleton
4. Mobile shell + offline sync framework + first end-to-end "round-trip" feature (e.g., daily activity log)
5. Observability baseline (OTel, Prometheus, Grafana, error tracking)

**Phase 2 — Core operational loop (validate the model end-to-end):**
6. Production: drilling + extraction + haulage (weighbridge)
7. Stockpile event-sourced ledger
8. Fuel & energy
9. HSE incidents
10. Real-time site dashboard (single site)

**Phase 3 — Operational completeness:**
11. Blasting + HSE clearance saga
12. Crushing + screening
13. Maintenance / CMMS
14. HR / time & attendance (with SIRH export)
15. Sales & shipping (contracts, BL, invoicing, customs export)

**Phase 4 — Analytics & consolidation:**
16. CDC pipeline (Debezium) + warehouse + dbt models
17. Cost-per-tonne semantic layer
18. Multi-currency, multi-country consolidation
19. Group exec dashboard

**Phase 5 — IoT and advanced integrations:**
20. Edge gateway deployment pattern
21. Telematics ingestion
22. Fuel sensor automation
23. Vibration / blast monitoring integration

**Phase 6 — Hardening & scale:**
24. Per-tenant DB upgrade path
25. Multi-region failover
26. Advanced RBAC (delegation, temporary access)
27. Post-MVP optional modules (downstream transformation, full payroll)

**Rationale for ordering:**
- Foundation phases must complete before any domain work — RLS, tenancy, sync framework, master data are load-bearing for every downstream module.
- Core operational loop (Phase 2) validates the offline sync model, the event bus, the dashboard pattern, and the multi-tenant guarantees on a manageable subset before expanding scope.
- Analytics (Phase 4) intentionally deferred — building dbt models against unstable schemas is wasted work. Wait until operational schemas stabilize.
- IoT (Phase 5) deferred because it requires field installation logistics and adds little value until the manual baseline is captured (you need the manual flow as fallback anyway).
- Sales/finance (end of Phase 3) deferred because regulatory and customs work is slow and benefits from operational data already flowing.

## Sources

- AWS Reference Architecture: Mining IoT and Telemetry (lambda architecture, edge gateway pattern)
- Microsoft Azure Industry Reference Architecture: Mining Operational Intelligence (data flow, consolidation)
- Hexagon Mining / MineSight, Sandvik AutoMine architecture white papers (bounded contexts in mining)
- PowerSync, ElectricSQL, WatermelonDB documentation (offline sync patterns for SQL)
- Debezium + dbt + ClickHouse case studies for SaaS multi-tenant analytics
- "Designing Data-Intensive Applications" (Kleppmann) — event sourcing, CDC, lambda architecture
- OWASP Multi-Tenant SaaS guidance — RLS isolation strategy
- TimescaleDB and InfluxDB IoT reference architectures
- Keycloak documentation — multi-tenant OIDC with group claims
- OHADA accounting framework references for analytical-vs-statutory accounting separation

---
*Architecture research for: Mining/Quarry ERP — Gravel Ivoire*
*Researched: 2026-05-12*
