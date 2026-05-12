# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-12
**Phase:** 01-foundation
**Mode:** `--auto` (no interactive Q&A — decisions resolved from research artifacts)
**Areas auto-resolved:** Identity & SSO, Multi-Tenant Isolation, Sync Offline-First, Money Model, Time / OperationalDay, Master Data, Audit Trail, I18n, Mobile Shell, Observability, Infrastructure, Backend Codebase Shape

---

## Identity & SSO

| Option | Description | Selected |
|--------|-------------|----------|
| Keycloak 26 self-hosted | OSS OIDC, control plane local | ✓ |
| Auth0 (SaaS) | Managed, unit-economics issue Afrique de l'Ouest | |
| Ory Kratos + Hydra | Modulaire mais plus de glue à écrire | |

**Auto-selected:** Keycloak 26 — recommandation STACK.md HIGH confidence.

| Option | Description | Selected |
|--------|-------------|----------|
| Single realm + groups par pays/site | Simple en v1, migration possible Phase 6 | ✓ |
| Realm-per-country dès v1 | Sur-engineering pour CI-only au démarrage | |

**Auto-selected:** Single realm + groups — SUMMARY.md explicite Phase 1.

---

## Multi-Tenant Isolation

| Option | Description | Selected |
|--------|-------------|----------|
| PostgreSQL RLS pooled | Un schema, RLS via GUC tenant_id | ✓ |
| Schema-per-tenant | Migration cost + connection pressure | |
| DB-per-tenant | Coût ops insoutenable pour démarrage | |

**Auto-selected:** RLS pooled — ARCHITECTURE.md explicite.
**Note:** ADR chemin DB-per-tenant pour clients VIP livré en Phase 1, implémentation Phase 6.

---

## Sync Offline-First

| Option | Description | Selected |
|--------|-------------|----------|
| PowerSync (commercial) + Drift | Mature, économise 6+ mois ingénierie | ✓ |
| ElectricSQL | Maturité write-path encore en évolution | |
| Sync maison sur HTTP delta | Piège ingénierie 6+ mois | |

**Auto-selected:** PowerSync + Drift — STACK.md "plus grosse dépendance commerciale du stack, justifiée".

| Option | Description | Selected |
|--------|-------------|----------|
| Conflict policy global LWW | Perte silencieuse sur tickets pesage concurrents | |
| Per-entity registry (append-only / event-sourced / pessimistic / LWW) | Aligné domaine | ✓ |
| Full CRDT | Audit/regulator-unfriendly, payload bloat | |

**Auto-selected:** Per-entity registry — ARCHITECTURE.md + PITFALLS.md #2.

---

## Money Model

| Option | Description | Selected |
|--------|-------------|----------|
| dinero.js v2 + bigint minor units | Standard moderne, lint friendly | ✓ |
| numeric Postgres + service maison | Risque arrondi cumulé | |
| Float | Banni par PITFALLS.md #3 | |

**Auto-selected:** dinero.js + bigint — STACK.md + PITFALLS.md #3.

**Three amounts per transaction (original / site-functional / group):** non-négociable, marqué PITFALLS.md #3.

---

## Time / OperationalDay

| Option | Description | Selected |
|--------|-------------|----------|
| `OperationalDay` entité first-class par site | Reports stables, DST-safe | ✓ |
| Query par `created_at` brut | Casse aux changements DST + shifts de nuit | |

**Auto-selected:** OperationalDay — PITFALLS.md #9 explicite.
**Lint custom CI:** détecter tout report qui groupe par `created_at::date` au lieu de `operational_day_id`.

---

## Master Data Entities

| Option | Description | Selected |
|--------|-------------|----------|
| Hard-delete autorisé | Casse FK historiques, audit incomplet | |
| Soft-delete + archive flag | Préserve historique, FK rejette si archived_at NOT NULL | ✓ |

**Auto-selected:** Soft-delete + archive.

**Géométries:** PostGIS dès Phase 1 — coût marginal, bénéfice énorme dès Phase 5 (zones de tir, polygones bancs).

---

## Audit Trail

| Option | Description | Selected |
|--------|-------------|----------|
| Triggers Postgres → audit_log partitionné mois | Capture exhaustive, transparent app | ✓ |
| Audit applicatif dans chaque service | Bypass possible si direct SQL | |
| Outbox + CDC vers stream | Sur-engineering Phase 1 | |

**Auto-selected:** Triggers Postgres + partition mensuelle.

| Option | Description | Selected |
|--------|-------------|----------|
| Chain-of-hash dès Phase 1 | Anticipe HSE/tir Phase 2-3 sans rétrofit | ✓ |
| Audit simple, chain ajoutée Phase 2 | Rétrofit douloureux | |

**Auto-selected:** Chain-of-hash dès Phase 1 — PITFALLS.md #1, #7.

---

## I18n

| Option | Description | Selected |
|--------|-------------|----------|
| Transloco (Angular) + Flutter intl ARB | Standard moderne, lazy-load | ✓ |
| Angular built-in @angular/localize | Compile-time, moins flexible | |

**Auto-selected:** Transloco + Flutter intl.

**Locales v1:** `fr-CI` (default), `en-CI`. Locales supplémentaires Phase 6 quand 2e pays activé.

---

## Mobile Shell + First Round-Trip

| Option | Description | Selected |
|--------|-------------|----------|
| Flutter + PowerSync + Drift + Riverpod | Choix STACK.md | ✓ |
| React Native + WatermelonDB | Ecosystème offline plus faible | |
| Native Android (Kotlin) | Pas iOS rapidement | |

**Auto-selected:** Flutter — STACK.md.

| Option | Description | Selected |
|--------|-------------|----------|
| Journal d'activité quotidien comme round-trip | Validation sync, pas un module métier | ✓ |
| Saisie foration comme round-trip | Mélange Phase 1 / Phase 2 | |

**Auto-selected:** Journal d'activité quotidien — neutre côté business, valide la chaîne sync end-to-end.

---

## Observability

| Option | Description | Selected |
|--------|-------------|----------|
| OpenTelemetry + Grafana LGTM self-hosted | OSS, contrôle data | ✓ |
| Datadog SaaS | Coût + data residency | |
| Sentry seul | Pas de traces/metrics complets | |

**Auto-selected:** OTel + Grafana LGTM — STACK.md.

---

## Infrastructure & Tooling

| Option | Description | Selected |
|--------|-------------|----------|
| AWS EKS + RDS Postgres 18 + S3 | Maturité région af/eu | ✓ |
| Azure / GCP | Latence + procurement local | |
| Bare-metal Hetzner / OVH | Ops burden | |

**Auto-selected:** AWS EKS — STACK.md.

| Option | Description | Selected |
|--------|-------------|----------|
| OpenTofu IaC + ArgoCD GitOps | Licence-safe, état mature | ✓ |
| Terraform BSL | Risque licence pour SaaS | |
| Pulumi | Communauté plus petite | |

**Auto-selected:** OpenTofu + ArgoCD — STACK.md.

---

## Backend Codebase Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Monorepo pnpm workspaces (NestJS + Angular + Flutter sub-repo) | Refactor cross-package facile | ✓ |
| Polyrepo | Friction shared types | |

**Auto-selected:** Monorepo pnpm + Flutter en sub-repo dart.

| Option | Description | Selected |
|--------|-------------|----------|
| Modular monolith NestJS | Démarrage rapide, strangler plus tard | ✓ |
| Microservices dès Phase 1 | #1 mode d'échec ERP minier (ARCHITECTURE.md) | |

**Auto-selected:** Modular monolith.

| Option | Description | Selected |
|--------|-------------|----------|
| TypeORM (repository pattern + RLS friendly) | Aligné RLS, mature | ✓ |
| Prisma | Friction RLS documentée STACK.md | |
| Drizzle | Moins de support enterprise | |

**Auto-selected:** TypeORM.

---

## Claude's Discretion

Délégué au planner (peu de valeur à arbitrer en discussion) :
- Layout exact écrans admin web (suivre Material + AG-Grid + Formly).
- Structure fichiers monorepo (conventions NestJS CLI + Angular CLI).
- Nommage migrations Postgres.
- TypeORM migrations vs sqitch/atlas-go (Claude recommande TypeORM).
- Stratégie exacte health-check endpoints.
- Pipeline seed/fixtures dev.

## Deferred Ideas

- MFA SMS multi-fournisseur → Phase 6
- Realms Keycloak par pays → Phase 6
- Délégation RBAC fine → Phase 6
- DB-per-tenant pour VIP → Phase 6 (ADR Phase 1)
- OpenSearch / recherche full-text → reporté, Postgres FTS suffit en v1
- Kafka/Redpanda event bus → Phase 5
- CDC Debezium + ClickHouse → Phase 4
- iOS native app → Phase 6
- Co-design opérateurs terrain → kick-off Phase 2
- Export adapters Sage/Ciel/Odoo OHADA → Phase 4

## Notes

Aucun todo backlog préexistant à examiner (projet vient d'être initialisé).
Aucun codebase à scout (greenfield).
Aucun CONTEXT.md de phase antérieure (Phase 1 = premier).
