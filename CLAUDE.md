<!-- GSD:project-start source:PROJECT.md -->
## Project

**Gravel Ivoire — ERP Carrière de Granite**

Plateforme ERP spécialisée pour exploitants de carrières de granite, opérant en mode multi-site et multi-pays. L'application digitalise et pilote toute la chaîne opérationnelle d'une carrière — de l'exploration géologique à la vente/expédition — en passant par la foration, le tir de mine, l'extraction, le concassage, le criblage, le stockage, la maintenance des engins, le HSE, les RH et le contrôle de gestion. Destinée à la Direction Groupe, aux Directeurs de site, Chefs Carrière, équipes Maintenance, HSE et Finance.

**Core Value:** Donner à un groupe minier (Gravel Ivoire) une visibilité temps réel consolidée sur la production, les coûts à la tonne et la sécurité de chaque site/pays, avec saisie terrain mobile fiable même en mode offline.

### Constraints

- **Architecture** : backend microservices multi-tenant ; obligation de synchronisation offline pour le mobile terrain.
- **Stack** : à arbitrer entre Node.js/NestJS et Java Spring Boot pour le backend ; React ou Angular pour le web ; Flutter privilégié pour le mobile (cohérence avec choix multi-plateformes).
- **Base de données** : PostgreSQL avec réplication multi-site, sauvegardes automatiques.
- **Infrastructure** : cloud hybride (AWS/Azure/GCP au choix), VPN sécurisé inter-sites.
- **Localisation** : multi-devise, multi-langue, fiscalité et réglementation locales — impact direct sur les modules Vente, Finance et HSE.
- **Sécurité** : données sensibles (explosifs, incidents accidents, financier consolidé) — RBAC fin, audit trail, chiffrement au repos et en transit.
- **Performance terrain** : saisie mobile doit rester fluide hors-ligne sur appareils Android d'entrée de gamme robustes.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Executive Recommendation
- **Backend:** NestJS 11 (TypeScript) modular monolith → split into services per bounded context as load demands. *Not* a 15-microservice big bang on day one.
- **Database:** PostgreSQL 18 with PostGIS 3.5 + TimescaleDB hypertables for telemetry. Single cluster, RLS-based pooled multi-tenancy with `tenant_id` on every row.
- **Mobile:** Flutter 3.35+ (stable, 2026) with **PowerSync** as the sync engine over a local SQLite store. Drift ORM on top for type-safe Dart queries.
- **Web:** Angular 20 (LTS). This is an ERP — opinionated structure, forms-heavy, large team over years. React is wrong tool for this shape.
- **Identity:** Keycloak 26 self-hosted, one realm per tenant country (CI, BF, ML, SN…), groups for site-level RBAC.
- **IoT ingestion:** EMQX 5.x (MQTT broker) → Kafka (Redpanda) → consumers writing into TimescaleDB. Do not skip the Kafka buffer.
- **Real-time push to UI:** Server-Sent Events (SSE) by default, WebSockets only where bidirectional needed. NestJS supports both natively.
- **Cache / queue:** Redis 7.x (cache, rate limit, BullMQ jobs).
- **Search:** OpenSearch 2.x for cross-module full-text (BLs, contracts, equipment serials, incidents).
- **Observability:** OpenTelemetry SDKs → Grafana LGTM stack (Loki + Grafana + Tempo + Mimir). Self-hostable, no vendor lock-in.
- **CI/CD:** GitHub Actions + ArgoCD (GitOps) on EKS.
- **IaC:** OpenTofu (not Terraform — BSL license is a real constraint for a multi-tenant SaaS).
## Core Technologies
| Technology | Version | Purpose | Why This Choice |
|------------|---------|---------|-----------------|
| **NestJS** | 11.x (Jan 2025) | Backend framework (HTTP, gRPC, microservices, jobs) | Opinionated, TypeScript-first, built-in DI, modules, guards, interceptors — maps cleanly to ERP domain modules (Foration, Tir, Extraction…). SWC default in v11 → 20× faster builds. First-class microservice transporters (Kafka, NATS, Redis). Avoids Spring Boot's JVM ops weight for a French-speaking dev pool where TS skills outnumber Java skills in the West African market. **Confidence: HIGH.** |
| **Node.js** | 24 LTS (Active LTS, EOL 2028-04) | Runtime | Active LTS as of 2026. Don't pick 22 (already in Maintenance) or 26 (Current, not LTS). **Confidence: HIGH.** |
| **PostgreSQL** | 18 | Primary OLTP database | v18 (released 2025) has the new async I/O subsystem — up to 3× read perf. Mature, OHADA-friendly (open-source, no per-core licensing for multi-country expansion), proven multi-tenant patterns. **Confidence: HIGH.** |
| **PostGIS** | 3.5 | Geospatial extension | Mandatory for: GPS coords of carrières/bancs/trous de forage, fleet tracking, permits zone polygons, vibration measurement geolocation. ST_DWithin, ST_Contains, GIST indexes — no replacement on Postgres. **Confidence: HIGH.** |
| **TimescaleDB** | 2.17+ | Time-series extension on same Postgres | Hypertables for IoT telemetry (GPS pings, fuel sensor readings, crusher vibration). Keeping it in Postgres avoids dual-DB ops (vs InfluxDB). Continuous aggregates power dashboards. **Confidence: HIGH.** |
| **Flutter** | 3.35+ stable (2026) | Mobile (Android + iOS) | Single codebase, Impeller renderer now default on Android (perf parity with native), excellent for forms-heavy field entry. Better than React Native for low-end Android (target: rugged Android devices on remote sites). **Confidence: HIGH.** |
| **PowerSync** | latest SDK | Offline-first sync engine for Flutter ↔ Postgres | Bidirectional sync, SQLite locally, server-side write validation through your own NestJS API (critical — conflict resolution for ERP writes like BL creation, stock movements must run business rules). Battle-tested in production mobile vs ElectricSQL which is still maturing. **Confidence: HIGH.** |
| **Drift** | 2.x | Flutter ORM on top of PowerSync's SQLite | Compile-time SQL safety, type-safe queries. PowerSync ships official `drift_sqlite_async` integration. **Confidence: HIGH.** |
| **Angular** | 20 LTS | Web frontend | ERP = forms-heavy, large data grids, deep navigation, multi-year codebase, large team. Angular's enforced structure (DI, modules, RxJS, typed forms, signals in v17+) is the right guardrail. React works but you'll reinvent half of Angular. **Confidence: HIGH for the ERP-fit reasoning.** |
| **Keycloak** | 26.x | Identity & access management | Self-hosted (data residency for OHADA), realms-per-country, SAML+OIDC, social login, MFA, fine-grained authz (Keycloak Authorization Services). Free, mature, runs on JVM but as a sidecar service (not in your app stack). **Confidence: HIGH.** |
| **EMQX** | 5.x | MQTT broker for IoT ingestion | Industry standard for fleet telematics, fuel-sensor MQTT clients. Native bridges to Kafka and TimescaleDB. Handles disconnected devices, QoS levels, retained messages — exactly the connectivity profile of remote quarries. **Confidence: HIGH.** |
| **Redpanda** (or Apache Kafka 3.7+) | 24.x | Event streaming / message broker | Kafka-API compatible, single binary, no Zookeeper, lower ops burden than Kafka. Used as durable buffer between EMQX and consumers, and for inter-service events (production-event, stock-movement, BL-created…). **Confidence: HIGH.** |
| **Redis** | 7.4 | Cache, rate limit, BullMQ job queue | Universal. BullMQ for delayed jobs (re-sync retries, daily KPI rollups, alert dispatch). **Confidence: HIGH.** |
| **OpenSearch** | 2.x | Search engine | Cross-module search (find a BL by truck plate, search an incident by site+keyword). Forked from Elasticsearch under Apache-2.0 — no Elastic license risk. **Confidence: HIGH.** |
## Supporting Libraries (Backend — NestJS)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@nestjs/typeorm` + TypeORM | 0.3.x | ORM | Primary ORM. TypeORM has matured; Prisma is fine but its multi-schema / RLS-context support is weaker for tenant-scoped workloads. |
| `nestjs-cls` | latest | Async-local-storage for tenant context | Mandatory pattern: every request sets `tenant_id` + `user_id` in CLS, TypeORM subscriber injects it into queries and into `SET LOCAL app.current_tenant` for RLS. |
| `@nestjs/microservices` (Kafka transport) | 11.x | Service-to-service events | Use Kafka transport, not Redis pub/sub, for production. |
| `@nestjs/bull` (BullMQ) | latest | Background jobs | Sync reconciliation, report generation, IoT alert fan-out. |
| `class-validator` + `class-transformer` | latest | DTO validation | Built into NestJS pipes. Non-negotiable for ERP input. |
| `nestjs-i18n` | latest | i18n (FR/EN minimum, AR later if expansion) | Required from day one — French is primary, English is required for expat ops directors. |
| `nestjs-pino` | latest | Structured logging | JSON logs → Loki via OpenTelemetry collector. |
| `@willsoto/nestjs-prometheus` | latest | Prometheus metrics | App-level counters/histograms. |
| `@opentelemetry/sdk-node` | 0.50+ | Tracing | Auto-instruments HTTP, Postgres, Kafka, Redis. |
| `dinero.js` | 2.x | Multi-currency money math | NEVER use floats for XOF/EUR/USD. Dinero is the immutable, ISO-4217-aware choice. |
| `date-fns-tz` | latest | Timezones | Multi-country = multi-TZ (Africa/Abidjan, Africa/Ouagadougou…). Store UTC, render local. |
| `pg-boss` | optional alt to BullMQ | Postgres-backed jobs | Use if you want to avoid a second stateful service in Phase 1. |
| `casl` | latest | Authorization rules (CASL) | Express RBAC + ABAC: "Chef Carrière of site X can validate plans de tir for site X only." Sits alongside Keycloak. |
## Supporting Libraries (Mobile — Flutter)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `powersync_flutter` | latest | Sync engine | Always — core of offline-first. |
| `drift` + `drift_sqlite_async` | 2.x | Typed ORM | Always. |
| `riverpod` | 2.5+ | State management | Riverpod > Bloc for new Flutter projects in 2025–2026. Compile-time safe, testable. |
| `dio` | 5.x | HTTP client (non-sync API calls) | For one-off calls outside sync scope (e.g., file upload, signed URL fetch). |
| `flutter_secure_storage` | latest | Token storage | OAuth tokens, never in shared prefs. |
| `geolocator` + `flutter_background_geolocation` | latest | GPS capture | Foration GPS hole tagging, on-device transport tracking. |
| `mobile_scanner` | latest | Barcode/QR | Pesage tickets, BL scanning, equipment QR tags. |
| `signature` | latest | Offline signatures | BL terrain signature capture. |
| `intl` | latest | i18n (FR/EN) | Always. |
## Supporting Libraries (Web — Angular)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@angular/material` + CDK | 20.x | UI primitives | ERP dashboards. Material is dense, professional, ERP-appropriate. |
| `ag-grid-enterprise` | 32.x | Data grid (commercial license) | Production-grade tables for thousands of BLs, rotations, employee rows. Free `ag-grid-community` works but loses pivots/group rows. Plan for the enterprise license. |
| `@tanstack/angular-query` | latest | Server state | Yes, TanStack Query has an Angular adapter now. Replace ad-hoc HttpClient + service caching. |
| `ngrx/signals` | 18.x | Local UI state | Signal-store, lightweight. Avoid classic NgRx (too much boilerplate for ERP forms). |
| `@formly/angular` | 6.x | Dynamic forms | ERPs have *hundreds* of forms. Schema-driven (JSON) forms reduce them to config. |
| `apexcharts` or `echarts` | latest | Dashboards | Echarts for heavier viz (heatmaps, geomaps); ApexCharts for KPI tiles. |
| `transloco` | latest | i18n | Better DX than built-in @angular/localize for an ERP — runtime language switch without rebuild. |
| `leaflet` + `ngx-leaflet` | latest | Maps (sites, fleet, plans tir) | Open-source; pair with self-hosted OSM tiles or MapTiler API. |
## Infrastructure & DevOps
| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| **OpenTofu** | 1.8+ | IaC | Drop-in Terraform replacement, Apache-2.0. Avoids Terraform's BSL — non-negotiable for a SaaS that may one day need to embed/distribute IaC. |
| **Docker** + **Buildx** | latest | Containers | Multi-arch builds (ARM for cheaper AWS Graviton instances). |
| **Kubernetes (EKS)** | 1.30+ | Orchestration | EKS preferred over Azure/GCP because AWS af-south-1/eu-west-3 latency to West Africa is acceptable and AWS Direct Connect partners exist in Abidjan. |
| **ArgoCD** | 2.12+ | GitOps deployment | Declarative, audit-friendly — fits regulated multi-country deploys. |
| **GitHub Actions** | — | CI | Build, test, scan, push, ArgoCD-sync. |
| **Trivy** | latest | Container + IaC scanning | In CI. |
| **OpenTelemetry Collector** | 0.110+ | Telemetry pipeline | All logs/metrics/traces flow through it → Grafana LGTM. |
| **Grafana** | 11.x | Dashboards | Single pane for app + infra + IoT. |
| **Loki** | 3.x | Logs | Cheap log storage (label-indexed, not full-text). |
| **Tempo** | 2.5+ | Traces | Distributed traces for tenant request flow. |
| **Mimir** | 2.13+ | Metrics (Prometheus-compatible) | Long-term metric storage. |
| **WireGuard** | latest | VPN inter-site | Modern, kernel-fast, simpler than IPsec. Each site router → AWS VPC. |
| **MinIO** or **AWS S3** | — | Object storage | Photos HSE, signed BLs, equipment manuals, sync attachments. |
| **pgBackRest** | 2.55+ | Postgres backups | PITR, encrypted, S3-compatible target. Don't rely on RDS-only snapshots. |
| **Pgpool-II** or **PgBouncer** | latest | Connection pooling | PgBouncer in transaction mode is sufficient; matches NestJS connection lifecycle. |
## Installation Snapshot (illustrative)
# Backend (NestJS 11 on Node 24)
# Web (Angular 20)
# Mobile (Flutter)
## Alternatives Considered
| Recommended | Alternative | When the alternative is actually better |
|-------------|-------------|------------------------------------------|
| **NestJS / Node 24** | Spring Boot 3.4 / Java 21 | If you already have a Java-heavy ops team and a JVM stack. Spring's mature multi-tenancy via Hibernate filters is real, and JPA criteria queries beat TypeORM for very complex reporting. But for a greenfield West African pool, TS+Node hiring is easier. |
| **PostgreSQL 18 + Timescale** | Postgres 18 + InfluxDB 3 | If telemetry > 100k points/sec/site. Then InfluxDB IOx (Parquet+Arrow) outscales Timescale. You are not there for years. |
| **Flutter** | React Native (Expo SDK 52+) | If your future hires are primarily React devs and you want a shared model layer with the web app. Flutter wins on offline-first because PowerSync + Drift is a mature combo and on perf on low-end Android. |
| **PowerSync** | ElectricSQL (electric-next) | Once Electric stabilizes its write path (Phase 2 of their roadmap). Today, PowerSync is the production answer. |
| **PowerSync** | Custom sync (queue + REST + last-write-wins) | Never. You'll burn 6+ engineer-months reinventing conflict resolution, schema migration, and partial sync — and you'll get it wrong. This is the highest-leverage commercial component to adopt. |
| **Angular 20** | React 19 + Next.js 15 | If you want public-facing marketing + customer portals sharing components. For internal ERP, Angular wins. |
| **Angular 20** | Vue 3 + Nuxt | Smaller community for ERP-scale apps; weaker form story. Pass. |
| **Keycloak** | Ory Kratos+Hydra+Keto | If you want headless, Go-native, K8s-friendly identity and have the team to build flows. Otherwise Keycloak's admin UI saves months. |
| **Keycloak** | Auth0 / Logto Cloud | Auth0 pricing ($0.07/MAU after Okta restructure) ruins unit economics at 50k+ MAU. Data residency in Africa is also a constraint Keycloak self-host solves. |
| **EMQX 5** | HiveMQ CE / Mosquitto | Mosquitto is fine for ≤10k devices, no clustering. HiveMQ CE has no clustering in OSS. EMQX has free clustering. |
| **Redpanda** | Apache Kafka 3.7 + KRaft | Kafka is the safe choice with maximum ecosystem; Redpanda is operationally cheaper. Either works. |
| **OpenTofu** | Pulumi (TypeScript) | If your infra-eng team is also your app-eng team, TS infra-as-code reduces context switching. Smaller community module library is the tradeoff. |
| **Grafana LGTM** | Datadog / New Relic | If budget supports it and you want to skip building observability ops. Datadog gets very expensive at multi-country, IoT-heavy scale. |
| **AG Grid Enterprise** | Handsontable, TanStack Table | TanStack Table is unstyled — too much work for an ERP. Handsontable lacks Angular polish. AG Grid is the production ERP grid. |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Sequelize** | Stale typings, weak migration story, no good RLS-context hook | TypeORM (or Prisma if you accept the tradeoffs on tenant context) |
| **Prisma** *(for this project)* | RLS + per-request tenant context requires raw `SET LOCAL` plumbing that's awkward; Prisma's connection pool is per-process not per-request. Workable but friction-heavy in a strict-RLS multi-tenant ERP | TypeORM with subscribers + `nestjs-cls` |
| **Express.js (bare)** | No structure for a 50+ module ERP, you'll reinvent NestJS badly | NestJS |
| **MongoDB as primary store** | ERP = relational, transactional, financial. Don't | PostgreSQL |
| **Firebase / Firestore** | Vendor lock, no SQL, multi-tenant boundaries hard, OHADA data residency unclear | Self-hosted Postgres + PowerSync |
| **Hasura / PostgREST as primary API** | Auto-generated APIs collapse under domain logic weight (validation of plans de tir, BL workflows, OHADA reporting) | NestJS controllers + services |
| **Realm (MongoDB Atlas Device Sync)** | Atlas Device Sync was sunset (EOL Sept 2025). Don't | PowerSync + SQLite |
| **Hive** (Flutter NoSQL) | Hive 2 unmaintained; Hive 4/Isar split is messy; no sync engine | Drift + PowerSync |
| **React Native (default)** | Lower perf ceiling on cheap Android, weaker offline-sync ecosystem than Flutter+PowerSync | Flutter |
| **NgRx (classic store)** | Boilerplate hell on an ERP this large | `@ngrx/signals` + TanStack Query |
| **Socket.IO** | Overkill, sticky-session pain in K8s, custom protocol | Native WebSocket from NestJS for bidirectional; SSE for server-push only |
| **Elasticsearch 8+** | Elastic License v2 is not OSS — multi-tenant SaaS distribution risk | OpenSearch 2.x |
| **Mosquitto at scale** | No native clustering in OSS, no Kafka bridge | EMQX 5 |
| **Terraform 1.6+** | BSL license, vendor concentration | OpenTofu |
| **InfluxDB 1.x / 2.x** | 2.x is being deprecated for IOx (3.x); migrations are painful; not in same DB as relational | TimescaleDB (in your Postgres) |
| **Datadog for everything** | Costs explode with IoT ingestion volume | Self-host Grafana LGTM, send only critical alerts upstream |
| **Raw floats for money** | XOF has no decimals (1 XOF = 1 XOF), EUR has 2 — float math will produce off-by-cent errors on multi-currency consolidation that auditors notice | `dinero.js` (immutable, minor units) |
| **Spring Boot just because "enterprise"** | JVM ops cost, slower iteration, smaller TS+Java talent overlap in Côte d'Ivoire / West Africa | NestJS 11 |
## Stack Patterns by Variant
- NestJS as a **modular monolith** (one deployable, modules wired via in-process DI). Don't ship 12 microservices on day one.
- Single Postgres 18 instance with PostGIS + Timescale, RLS for tenants, read replica for reports later.
- Keycloak single realm, groups for sites.
- EMQX single node, direct bridge to Postgres (skip Kafka until volumes justify it).
- Skip OpenSearch until search becomes a complaint — Postgres FTS (`tsvector`) is enough early.
- Extract first microservices along bounded contexts that actually fight (Production / Maintenance / Finance / IoT-ingestion). Stay monolith for everything else.
- Add Redpanda between EMQX and Postgres for durable buffering.
- Add OpenSearch for cross-module search.
- Per-country Keycloak realm.
- Postgres logical replication for cross-region read replicas (Abidjan + Dakar).
- Dedicated reporting/OLAP layer: ClickHouse or Postgres + Citus for consolidation.
- Service mesh (Istio or Linkerd) if microservice count > 8.
- Active-active multi-region for Postgres only if RPO/RTO demands it (likely not — async replication is fine).
## Version Compatibility Notes
| A | Compatible with | Notes |
|---|------------------|-------|
| NestJS 11 | Node ≥20, prefer 22 LTS or 24 LTS | Node 24 recommended; NestJS 11 supports ESM and CJS. |
| TypeORM 0.3.x | PostgreSQL 12-18 | Works fine with PG 18; verify driver `pg` ≥8.11. |
| PostGIS 3.5 | PostgreSQL 13-18 | Install via `CREATE EXTENSION postgis` in tenant DB. |
| TimescaleDB 2.17 | PostgreSQL 14-17; PG18 support tracking — verify before pinning PG18 | If TimescaleDB lags on PG18, run PG17 for a few months. **MEDIUM confidence — verify against Timescale release notes at install time.** |
| PowerSync | Flutter ≥3.13, Drift 2.18+, Postgres ≥11 with logical replication on (`wal_level=logical`) | Logical replication slots must be enabled. |
| Keycloak 26 | JDK 21 | Run as containerized sidecar service. |
| Angular 20 | Node ≥20, TypeScript 5.5+ | LTS, current as of 2026. |
| Flutter 3.35+ | Dart 3.7+ | Default Impeller on Android. |
## OHADA / Multi-Country Accounting Note (LOW confidence area)
- ERP owns **analytical accounting** (cost per ton per site, internal P&L) in Postgres.
- Export ledger entries to local certified accounting software per country (Sage 100 / Sage X3 / Odoo Accounting localized / Ciel — varies by country and customer preference) via a CSV/XML/JSON export module.
- Currency: XOF (Franc CFA BCEAO) for UEMOA countries, XAF for CEMAC if expanding east. Pin ISO-4217 codes in `dinero.js` config.
- Build the export module as a pluggable adapter — don't hard-code one accounting target.
## Quality Gate Self-Check
- [x] Versions current as of 2025-2026 (Node 24 LTS, PG 18, NestJS 11, Angular 20, Flutter 3.35+, Keycloak 26)
- [x] Rationale explains WHY each — domain-fit reasoning, not generic comparison
- [x] Confidence level per recommendation (HIGH except where flagged MEDIUM/LOW)
- [x] Specific to mining/ERP domain (offline field entry, IoT telematics, OHADA constraints, PostGIS for permits, multi-tenant per-country, rugged Android)
## Sources
- [NestJS 11 release notes — Trilon](https://trilon.io/blog/announcing-nestjs-11-whats-new) (HIGH)
- [PostgreSQL 18 release announcement](https://www.postgresql.org/about/news/postgresql-18-released-3142/) (HIGH)
- [PostgreSQL 18.3 / 17.9 minor release notes Feb 2026](https://www.postgresql.org/about/news/postgresql-183-179-1613-1517-and-1422-released-3246/) (HIGH)
- [Node.js release schedule (endoflife.date)](https://endoflife.date/nodejs) (HIGH)
- [Node.js 24 LTS upgrade guide](https://www.pkgpulse.com/guides/nodejs-24-lts-upgrade-from-node-22-2026) (MEDIUM)
- [Flutter 3.27 release blog (Jan 2025) — newer versions noted](https://blog.flutter.dev/whats-new-in-flutter-3-27-28341129570c) (HIGH)
- [PowerSync vs ElectricSQL comparison (official PowerSync)](https://www.powersync.com/blog/electricsql-vs-powersync) (MEDIUM — vendor-authored, cross-checked)
- [ElectricSQL vs PowerSync vs Zero independent comparison (2026)](https://trybuildpilot.com/648-electric-sql-vs-powersync-vs-zero-2026) (MEDIUM)
- [Best Local Database for Flutter Apps — Drift vs Isar benchmarks](https://dinkomarinac.dev/best-local-database-for-flutter-apps-a-complete-guide) (MEDIUM)
- [PowerSync + Drift integration docs](https://docs.powersync.com/client-sdks/orms/flutter-orm-support) (HIGH)
- [Keycloak vs Ory vs Auth0 comparison 2026](https://apiscout.dev/blog/ory-kratos-vs-auth0-vs-keycloak-2026) (MEDIUM)
- [Multi-tenant Postgres RLS — AWS prescriptive guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-managed-postgresql/rls.html) (HIGH)
- [Multi-tenant data isolation with Postgres RLS — AWS Blog](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/) (HIGH)
- [EMQX → TimescaleDB integration docs](https://docs.emqx.com/en/emqx/latest/data-integration/data-bridge-timescale.html) (HIGH)
- [EMQX Fleet Telematics solution](https://www.emqx.com/en/solutions/fleet-telematics) (HIGH)
- [Grafana LGTM observability stack guide](https://www.improving.com/thoughts/end-to-end-observability-with-prometheus-grafana-loki-opentelemetry-tempo/) (HIGH)
- [OpenTofu vs Terraform vs Pulumi 2026](https://eitt.academy/knowledge-base/terraform-vs-pulumi-vs-opentofu-iac-comparison-2026/) (MEDIUM)
- [Crunchy Data 2025 PostGIS release notes](https://www.crunchydata.com/blog/2025-postgis-and-geos-release) (HIGH)
- [PostGIS for enterprise — Percona](https://www.percona.com/blog/working-with-geospatial-data-postgis-makes-postgresql-enterprise-ready/) (MEDIUM)
- [TanStack Query + Zustand vs Redux 2025](https://medium.com/@vishalthakur2463/redux-toolkit-vs-react-query-vs-zustand-which-one-should-you-use-in-2025-048c1d3915f4) (MEDIUM)
- [React vs Angular enterprise breakdown](https://www.icertglobal.com/blog/react-vs-angular-enterprise-architecture-breakdown) (MEDIUM)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
