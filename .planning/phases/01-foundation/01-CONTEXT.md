# Phase 1: Foundation - Context

**Gathered:** 2026-05-12
**Status:** Ready for planning
**Mode:** `--auto` (greenfield, no prior phases, decisions resolved from research artifacts)

<domain>
## Phase Boundary

Phase 1 livre les **fondations load-bearing** du système : identité, isolation multi-tenant, sync offline-first, master data sites, modèle monétaire, modèle temporel (OperationalDay/Shift), audit trail immuable, i18n FR/EN, shell mobile + un round-trip end-to-end (journal d'activité quotidien).

**Out of phase scope** (belong elsewhere, do NOT discuss here):
- Tous les modules métier (Foration, Tir, Extraction, Transport, Stockpile, Carburant, HSE, RH, Ventes, Finance, Dashboards opérationnels) → Phases 2–5
- Analytics et consolidation → Phase 4
- Intégrations IoT → Phase 5
- Hardening multi-pays / multi-région → Phase 6
- Transformation aval, paie complète, comptabilité générale OHADA → Out of Scope projet

</domain>

<decisions>
## Implementation Decisions

Toutes les décisions ci-dessous sont **dérivées des artefacts de recherche** (`.planning/research/STACK.md`, `ARCHITECTURE.md`, `PITFALLS.md`, `SUMMARY.md`) et auto-validées en mode `--auto`. Chaque décision est annotée avec sa source.

### Identity & SSO
- **D-01 (Identity provider)**: **Keycloak 26** auto-hébergé, OIDC. *Source: STACK.md — refus d'Auth0 sur unit-economics et data-residency Afrique de l'Ouest.*
- **D-02 (Realm strategy v1)**: **Un seul realm avec groupes par pays/site**, PAS realm-par-pays. *Source: SUMMARY.md "Phase 1 should defer per-country Keycloak realms (single realm + groups)". Migration vers realms multi-pays reportée Phase 6.*
- **D-03 (MFA)**: MFA TOTP **optionnelle** par utilisateur en v1 ; rendue obligatoire par rôle (Direction Groupe, Finance) via policy Keycloak. SMS différé Phase 6 (multi-provider Africa's Talking).
- **D-04 (Claim shape)**: JWT porte `tenant_id`, `site_ids[]`, `role`, et `group_scope` (pour Direction Groupe = tous sites du tenant). Aucune décision RBAC fine au-delà du tuple `(role, site_id)` en v1.
- **D-05 (Session)**: Refresh token rotation, access token courte durée (15 min web / 60 min mobile), `httpOnly + SameSite=Lax` cookies web. Mobile stocke refresh en Keystore Android.

### Multi-Tenant Isolation
- **D-06 (Strategy)**: **PostgreSQL Row-Level Security pooled** (un schema partagé, RLS bound à `current_setting('app.tenant_id')`). PAS schema-per-tenant, PAS DB-per-tenant en v1. *Source: ARCHITECTURE.md — explicitement rejeté schema-per-tenant pour cost migration + connection pressure.*
- **D-07 (Defense in depth)**: 3 couches obligatoires : (1) RLS Postgres, (2) ORM scoping (TypeORM repository wrapper), (3) Gateway JWT → GUC injection. *Source: PITFALLS.md #5.*
- **D-08 (CI test)**: Test cross-tenant **bloquant** dans CI sur **chaque table** — un utilisateur de tenant A ne doit JAMAIS lire une ligne de tenant B. Test auto-généré par script qui itère sur le catalogue Postgres. *Critère de succès Phase 1 #2.*
- **D-09 (Upgrade path)**: ADR documente le chemin de migration vers DB-per-tenant pour clients VIP (Phase 6). Aucune implémentation en v1.

### Sync Offline-First
- **D-10 (Library)**: **PowerSync (commercial) + Drift (SQLite local)**. PAS de sync maison. PAS ElectricSQL en v1 (maturité write-path). *Source: STACK.md — explicitement marqué "plus grosse dépendance commerciale du stack, économise 6+ mois ingénierie".*
- **D-11 (Conflict policy framework)**: Le service de sync expose un **registre per-entité** avec 4 stratégies : (a) `append_only_event` (captures terrain, incidents HSE, rotations, BL, ravitaillements), (b) `event_sourced_ledger` (stockpile, cuves carburant), (c) `pessimistic_lock` (plans tir, plans forage), (d) `last_write_wins` (préférences utilisateur, master data non critique). *Source: ARCHITECTURE.md.*
- **D-12 (Phase 1 scope)**: Squelette de sync + framework conflict policy + **une seule entité réelle** (journal d'activité quotidien, stratégie `append_only_event`) suffit à valider le critère de succès #3. Les autres entités sont ajoutées dans leurs phases métier.
- **D-13 (Chaos harness)**: Tests "split-brain" obligatoires en CI : 2 clients offline modifient la même entité, sync trigger, vérifier que la stratégie de conflit produit le résultat attendu (pas de perte silencieuse).
- **D-14 (Ordering)**: AUCUN usage de `device.now()` pour ordonner les événements. Utiliser un Lamport clock ou `server_received_at + sequence`. *Source: PITFALLS.md #2.*

### Money Model
- **D-15 (Library)**: **dinero.js v2** côté backend et frontend. *Source: STACK.md.*
- **D-16 (Storage)**: `bigint` minor units + colonne `currency` (CHAR(3) ISO 4217) + scale dérivé par devise (XOF=0, EUR=2, USD=2). JAMAIS `float`/`numeric` flottant pour de l'argent. *Source: PITFALLS.md #3.*
- **D-17 (Three amounts per transaction)**: Chaque transaction stocke `amount_original` (devise saisie), `amount_site_functional` (devise du site), `amount_group` (devise pivot groupe — XOF par défaut, configurable). Conversion via taux **immuable référencé par ID** (`fx_rate_id`). Phase 1 livre la table `fx_rates` + le service ; les écritures sont consommées dans les phases métier.
- **D-18 (Rounding)**: Half-up banker's rounding au niveau minor unit ; arrondis cumulés interdits.

### Time / Operational Day
- **D-19 (Model)**: Entité `OperationalDay` first-class, scopée `site_id`. Colonnes : `id`, `site_id`, `business_date` (DATE, calendrier business du site), `shift_start_local` (TIME), `iana_timezone` (TEXT, ex. `Africa/Abidjan`), `started_at_utc`, `ended_at_utc`. *Source: PITFALLS.md #9.*
- **D-20 (Reporting query rule)**: Tout rapport requête par `operational_day_id`, JAMAIS par `created_at` brut. Lint custom dans CI pour détecter les violations.
- **D-21 (DST test)**: Test CI explicite qui simule un changement DST (utiliser un timezone DST réel comme `Europe/Paris` même si pas pertinent pour Afrique de l'Ouest, parce que tenants futurs peuvent y être) et vérifie que les calculs OperationalDay restent corrects.
- **D-22 (Shift)**: Modèle `Shift` lié à `OperationalDay` (jour, nuit, etc.) avec affectations futures (utilisé Phase 3 RH).

### Master Data — Sites, Zones, Permits
- **D-23 (Entities)**: `Tenant`, `Country`, `Site`, `ProductionZone`, `Bench` (banc d'exploitation), `Permit`. PostGIS pour géométries (point GPS site, polygones zones/bancs).
- **D-24 (Site fields)**: `id`, `tenant_id`, `country_id`, `name`, `code`, `gps_point` (PostGIS), `iana_timezone`, `functional_currency`, `manager_user_id`, `capacity_t_per_day`, `status` (active/standby/closed), `metadata` (JSONB).
- **D-25 (Permit)**: `id`, `site_id`, `type` (exploration, exploitation, environnemental, explosifs), `authority`, `reference`, `valid_from`, `valid_to`, `document_url` (object storage), `status`.
- **D-26 (Soft-delete vs archive)**: Pas de hard-delete sur master data. Statut + `archived_at`. Tous les modules métier rejettent référence à un site archivé.

### Audit Trail
- **D-27 (Mechanism)**: Audit append-only via triggers PostgreSQL générés (table `audit_log` partitionnée par mois). Capture `actor_user_id`, `tenant_id`, `table_name`, `row_pk`, `action`, `before_jsonb`, `after_jsonb`, `at_utc`, `request_id`. *Source: ARCHITECTURE.md + critère succès #5.*
- **D-28 (Chain of hash)**: Chaque ligne d'audit contient `prev_hash` + `row_hash` (SHA-256 de `(prev_hash || canonical_json(payload))`) pour détecter falsification. *Pattern PITFALLS.md #1 et #7, anticipé dès Phase 1 même si critique pour HSE/tir en Phases 2-3.*
- **D-29 (Immutable storage object refs)**: Convention dès Phase 1 — toute pièce jointe (futurs incidents, BL, rapports) référence un objet content-addressed (clé = SHA-256 du contenu) dans S3-compatible storage. Aucune écriture en place.

### I18n
- **D-30 (Web)**: **Transloco** pour Angular 20 (fichiers JSON FR/EN). *Source: STACK.md.*
- **D-31 (Mobile)**: Flutter `intl` + ARB files générés. Source de vérité partagée avec backend (`shared/i18n/`) pour les labels métier non-UI.
- **D-32 (User preference)**: Champ `preferred_locale` sur `User` (default = locale du tenant, lui-même default `fr-CI`). Switcher dans header web + écran réglages mobile.
- **D-33 (Dates/numbers)**: `Intl` (web) et `intl` (mobile) avec locale utilisateur. Devise formattée avec dinero.js.

### Mobile Shell + First Round-Trip
- **D-34 (Framework)**: **Flutter 3.35+ avec Riverpod + Drift + PowerSync**. Android-first ; iOS différé Phase 6. *Source: STACK.md.*
- **D-35 (Round-trip feature)**: **Journal d'activité quotidien** — l'opérateur saisit en offline : `date`, `site_id` (depuis session), `shift_id`, `notes` (texte libre, max 500), `photo` optionnelle (compressée localement). Stratégie sync `append_only_event`. Affiché côté web dans une liste read-only filtrable par site/date. *Cette feature N'EST PAS un module métier — c'est le sanity test du pipeline complet, conservée en v1 comme outil de debug terrain.*
- **D-36 (Auth flow mobile)**: OIDC native flow via `flutter_appauth` → Keycloak ; refresh token persisté en Android Keystore (`flutter_secure_storage`).

### Observability
- **D-37 (Stack)**: **OpenTelemetry SDK** dans NestJS + Angular + Flutter → **Grafana LGTM** (Loki, Grafana, Tempo, Mimir) auto-hébergé. *Source: STACK.md.*
- **D-38 (Phase 1 minimum)**: Traces sur chaque requête HTTP gateway → service → DB ; logs structurés JSON ; métriques `http_request_duration_seconds`, `db_query_duration_seconds`, `sync_event_processed_total`. Dashboard "Phase 1 health" minimal.

### Infrastructure
- **D-39 (Compute)**: **AWS EKS** (Kubernetes managé) Abidjan ou région la plus proche disponible (af-south-1 si SLA acceptable, sinon eu-west-3 Paris pour Phase 1). *Source: STACK.md — multi-région différé Phase 6.*
- **D-40 (DB)**: **PostgreSQL 18** sur RDS Multi-AZ + extensions PostGIS 3.5 + TimescaleDB (chargée mais utilisée seulement à partir de Phase 5 pour IoT). Connection pooler PgBouncer en sidecar.
- **D-41 (Object storage)**: AWS S3 avec object lock pour audit/incidents/permits ; bucket par tenant.
- **D-42 (IaC)**: **OpenTofu** (pas Terraform, raison de licence BSL). ArgoCD pour delivery GitOps.
- **D-43 (CI/CD)**: GitHub Actions (workflows déjà standard pour les contributeurs visés). Cache npm/pnpm/maven pour vitesse.

### Backend Codebase Shape
- **D-44 (Repo strategy)**: **Monorepo pnpm workspaces** : `apps/api` (NestJS), `apps/web` (Angular), `apps/mobile` (Flutter — sub-repo dart), `packages/shared-types`, `packages/i18n`, `infra/`.
- **D-45 (Modular monolith)**: NestJS modules par bounded context : `identity`, `tenancy`, `master-data`, `sync`, `audit`, `i18n`, `health`. Les modules métier seront ajoutés dans les phases suivantes au même niveau. *Source: ARCHITECTURE.md — strangler vers microservices uniquement quand profil scaling différent prouvé.*
- **D-46 (ORM)**: **TypeORM** (pas Prisma — friction RLS documentée dans STACK.md). Repository pattern avec wrapper tenant-scoping obligatoire.

### Claude's Discretion
Les domaines suivants sont délibérément laissés à l'appréciation du planner et de l'agent d'exécution (pas de valeur ajoutée à les décider en discussion) :
- Layout exact des écrans web admin (Material AG-Grid + Formly pour formulaires CRUD master-data, scaffold standard).
- Structure exacte des fichiers dans le monorepo (suivre conventions NestJS / Angular CLI).
- Nommage des migrations Postgres (suivre le format `<timestamp>__<verb>_<entity>.sql` en migrations natives ou TypeORM CLI).
- Choix entre `migrations TypeORM` natives vs `sqitch`/`atlas-go` : laisser planner trancher (recommandation Claude : TypeORM natives suffit Phase 1).
- Stratégie exacte de health-check endpoints (`/health/live`, `/health/ready`).
- Pipeline de seed/fixtures pour environnement de dev.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level
- `.planning/PROJECT.md` — Vision, Core Value, Constraints, Key Decisions
- `.planning/REQUIREMENTS.md` — v1 REQs FND-01 → FND-11 mappés à cette phase
- `.planning/ROADMAP.md` §"Phase 1: Foundation" — Goal + Success Criteria officiels

### Research artifacts (project-wide)
- `.planning/research/STACK.md` — Choix de stack prescriptifs avec versions (NestJS 11, Postgres 18, Flutter 3.35, Keycloak 26, dinero.js, Transloco, OpenTofu, ArgoCD)
- `.planning/research/ARCHITECTURE.md` — Bounded contexts, modular monolith, RLS multi-tenant, sync per-entity, audit trail
- `.planning/research/PITFALLS.md` §3 (multi-currency), §5 (multi-tenant), §9 (operational day), §2 (sync ordering) — patterns load-bearing en Phase 1
- `.planning/research/FEATURES.md` — Catégorisation table-stakes vs différenciateurs (référence pour Phases 2+)
- `.planning/research/SUMMARY.md` — Phase 1 implications + ordering rationale

### External docs (à consulter au moment du plan)
- PostgreSQL 18 RLS docs : https://www.postgresql.org/docs/18/ddl-rowsecurity.html
- PostgreSQL 18 GUC / `current_setting` pattern pour tenant injection
- PostGIS 3.5 release notes
- NestJS 11 module / DI guide officiel
- Keycloak 26 admin REST + flutter_appauth OIDC native flow
- PowerSync + Drift docs (architecture, conflict resolution, dev setup)
- Transloco Angular doc + Flutter `intl` ARB workflow
- dinero.js v2 API + currency scale table

### Aucun ADR ni spec interne préexistant à cette phase (greenfield)
Si le planner produit des ADR pendant la planification (recommandé pour D-06 RLS, D-10 PowerSync, D-19 OperationalDay, D-27 audit trail), les déposer dans `docs/adr/` numérotés `ADR-0001-*.md` et les rattacher à cette section dans une mise à jour de CONTEXT.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
Aucun — projet greenfield. Aucun code applicatif n'existe encore.

### Established Patterns
Aucun pattern codebase préexistant. Les patterns à établir dans cette phase deviennent canoniques pour toutes les phases suivantes :
- Tenant scoping pattern (TypeORM repository wrapper + GUC injection)
- Sync entity registration pattern (decorator `@SyncEntity({ strategy })`)
- Audit trigger generation pattern (script SQL généré par module)
- Money column convention (`amount_minor bigint`, `currency char(3)`, `fx_rate_id`)
- OperationalDay attachment convention (FK obligatoire sur toute table opérationnelle future)
- i18n key namespacing (`<module>.<feature>.<key>`)

### Integration Points
À créer :
- `apps/web` route shell (Angular routing) avec layout admin (sidebar + header avec switcher locale + tenant context)
- `apps/mobile` shell Flutter avec navigation rail + login + journal d'activité
- API gateway pattern (NestJS guards : `TenantGuard`, `RoleGuard`, `SiteScopeGuard`)
- Health endpoints (`/health/live`, `/health/ready`)

</code_context>

<specifics>
## Specific Ideas

- **Pipeline GitHub Actions** doit inclure un job "cross-tenant isolation test" (D-08) qui FAIL le PR si une seule table laisse passer une fuite. Ce job est obligatoire dès Phase 1.
- **Le journal d'activité quotidien (D-35) est un outil de debug terrain**, pas un module métier. Visible uniquement aux rôles Direction Groupe et Directeur Site. Ne pas le promouvoir comme une feature commerciale.
- **Le seeding dev doit produire 2 tenants × 2 sites × 5 users** pour rendre le test de fuite cross-tenant trivial à exécuter localement.
- **Documentation ADR encouragée** : produire au minimum 4 ADRs en Phase 1 (RLS strategy, PowerSync, OperationalDay, audit chain-of-hash). Ces ADRs sont des artefacts Phase 1 livrables, pas optionnels.

</specifics>

<deferred>
## Deferred Ideas

- **MFA SMS multi-fournisseur** (Africa's Talking, Twilio) → Phase 6 Hardening.
- **Realms Keycloak par pays** → Phase 6 quand un 2e pays est en production.
- **Délégation RBAC fine et accès temporaire** → Phase 6.
- **Migration DB-per-tenant pour clients VIP** → Phase 6 (ADR documenté en Phase 1).
- **OpenSearch / recherche full-text** → reporté ; en Phase 1+2 on utilise Postgres FTS standard.
- **Kafka/Redpanda event bus** → introduit en Phase 5 quand IoT exige le buffer. Pas de bus en Phase 1.
- **CDC Debezium + ClickHouse data warehouse** → Phase 4 (analytics consolidation).
- **iOS native app** → Phase 6 si demandé.
- **Co-design opérateurs terrain** → kick-off Phase 2 (avant production code mobile métier). Phase 1 ne nécessite pas de co-design car le journal d'activité est un outil interne.
- **Export adapters Sage/Ciel/Odoo OHADA** → Phase 4.

### Reviewed Todos (not folded)
Aucun (aucun todo backlog existant à ce stade — projet vient d'être initialisé).

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-05-12*
*Auto mode: decisions resolved from .planning/research/ artifacts; no user gray-area selection performed.*
