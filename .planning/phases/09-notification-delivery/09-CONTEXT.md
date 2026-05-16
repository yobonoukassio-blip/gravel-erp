# Phase 9: Notification Delivery - Context

**Gathered:** 2026-05-16
**Status:** Ready for planning
**Mode:** Decision-by-recommendation (user delegated calls)

<domain>
## Phase Boundary

Les alertes (Alert rows créées par Phase 8 + handlers existants) arrivent réellement aux destinataires :

1. **NTF-01** — Email via Brevo (BullMQ queue, retry exponentiel, fan-out depuis `alert_rule.role_codes`).
2. **NTF-02** — SMS via Twilio pour severity ≥ `high` (même queue, même retry, même fan-out).
3. **NTF-03** — Suppression des stubs `logger.log()` dans `AlertDispatcherService` ; tout passe par BullMQ. Plus un badge in-app dans le header Angular qui décrémente quand l'alerte est cliquée.

**Hors scope (différé v2)** :
- Webhooks de delivery status entrants (callbacks Brevo/Twilio pour bounce/delivered/click)
- UI configuration des alert_rule (CRUD admin)
- Templates customizables par tenant (v1.1 = templates hardcodés FR)
- Re-emit d'alertes non-acquittées après X jours
- Push notifications mobile (FCM/APNs)
- Discord/Slack/Teams webhooks
- A/B testing de templates

</domain>

<decisions>
## Implementation Decisions

### Queue Infrastructure (NTF-01, NTF-03)

- **D-01:** Queue backend = **BullMQ** sur le Redis Upstash existant (cf. memory project_deployment). Connection via `BullModule.forRoot()` au niveau AppModule avec config issue de `REDIS_URL` env var.
- **D-02:** Une queue unique nommée `notifications` (pas une queue par canal). Job payload type-discriminé : `{ channel: 'email'|'sms'|'in_app', alertId, recipients, subject?, body, metadata }`.
- **D-03:** Retry policy = **5 attempts, exponentiel backoff** (1s, 4s, 16s, 64s, 256s). Dead-letter queue automatique BullMQ (le job reste dans la queue `failed` après le dernier retry).
- **D-04:** Dead-letter queue handling = job persisté dans BullMQ `failed` set + un log `error` structuré. Pas d'alerte ré-émise sur stockage dead-letter dans cette phase (boucle infinie potentielle ; on traite à la main v1.1).
- **D-05:** Concurrency = 5 workers concurrents par instance (modéré pour respecter rate limits Brevo/Twilio). Configurable via `NOTIF_WORKER_CONCURRENCY` env.
- **D-06:** Tenant scoping = chaque job porte `tenantId` dans son payload. Le processor `SET LOCAL app.current_tenant` au début de chaque job pour respecter RLS.

### Email Provider (NTF-01)

- **D-07:** Provider = **Brevo (ex-Sendinblue)** via `@getbrevo/brevo` SDK officiel. Auth par API key (env var `BREVO_API_KEY`).
- **D-08:** From address = `BREVO_FROM_EMAIL` env var (défaut `noreply@gravel-ivoire.local` pour dev), display name `Gravel Ivoire ERP`.
- **D-09:** Template engine = **plain HTML inline** (pas MJML/HBS pour v1.1). Le body est généré par un helper TypeScript `renderEmailBody(alert, locale='fr-CI')` qui retourne `{ subject, htmlBody, textBody }` — 1 fonction par type d'alerte (PM overdue, spare part low, fuel anomaly, etc.). FR uniquement, l'anglais/arabe vient quand transloco backend sera fait (v2).
- **D-10:** Mode test = quand `NODE_ENV !== 'production'` ET `BREVO_SANDBOX_MODE === 'true'`, ajouter le header `X-Sib-Sandbox: drop` sur chaque envoi Brevo (n'envoie pas vraiment mais accepte la requête).

### SMS Provider (NTF-02)

- **D-11:** Provider = **Twilio** via SDK `twilio` officiel. Auth par `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN`.
- **D-12:** From number = `TWILIO_FROM_NUMBER` env var (Côte d'Ivoire = format E.164 `+225...`).
- **D-13:** Message format = **plain text, ≤ 160 chars** (1 SMS unit). Fonction `renderSmsBody(alert, locale='fr-CI')` tronque proprement avec `…` si dépasse. Pas de MMS ni d'URL longue (raccourcies via Twilio Click Tracking si dispo, sinon URL d'app courte type `gv.app/a/<id>`).
- **D-14:** Severity gate = SMS envoyé UNIQUEMENT si `Alert.severity IN ('high','critical')`. Severity `low|medium` reste in-app + email. Match le `alert_rule.severity_filter='critical'` déjà seedé en Phase 8.
- **D-15:** Mode test = quand `NODE_ENV !== 'production'` ET `TWILIO_TEST_MODE === 'true'`, utiliser le Twilio Test Credentials (`AC...` + `AC...` magic numbers Twilio).

### Dispatcher Refactor (NTF-03)

- **D-16:** `AlertDispatcherService.dispatch()` ne fait plus de `logger.log()` stub. Il enqueue dans BullMQ un job par `(channel, recipient_role_code)` après avoir résolu les destinataires :
  1. Charge les `alert_rule` matching (`event_type` + optionnel `severity_filter`)
  2. Pour chaque rule, pour chaque `channel`, pour chaque `role_code` → résout les `User` actifs avec ce rôle pour le `siteId` de l'alerte
  3. Push 1 job par (user, channel) dans la queue
- **D-17:** Recipient resolution = `User.role = role_code AND siteIds @> ARRAY[siteId]::uuid[] AND archivedAt IS NULL`. Si aucun user matché pour un role_code, log un warning structuré (`no_recipients_for_role`) mais ne fail PAS le dispatch.
- **D-18:** Idempotency = chaque job a un `jobId` déterministe `alert:<alertId>:channel:<channel>:user:<userId>` — BullMQ refuse les doublons par jobId. Si l'alerte est re-dispatched (rare), pas de double envoi.

### In-App Badge (NTF-03)

- **D-19:** Source de données = endpoint existant `GET /api/alerts?status=open&user_recipient=<currentUserId>` (ou créer si absent — Phase 8 a `AlertsController` qui supporte filtres). Le frontend pull au login + via SSE delta `kpi.delta` qui inclut `alerts_unread_count`.
- **D-20:** Composant Angular = `AlertBadgeComponent` déjà présent à `apps/web/src/app/features/alerts-inbox/widgets/alert-badge.component.ts`. Phase 9 enrichit le polling/SSE wire-up + `(click)` qui marque toutes les alertes vues (`PATCH /api/alerts/mark-seen` bulk).
- **D-21:** Décrément local = optimistic UI (le badge passe à 0 instantanément au clic) ; reconciliation via SSE après. Pas d'animation, pas de toast.

### Cross-Cutting

- **D-22:** Env vars nécessaires (à documenter dans `apps/api/.env.example`) :
  - `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, `BREVO_SANDBOX_MODE`
  - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TWILIO_TEST_MODE`
  - `NOTIF_WORKER_CONCURRENCY` (default 5)
  - `REDIS_URL` (déjà présent — Phase 1)
- **D-23:** Migration = 0 nouvelles tables. La trace de notification (envoi/échec) reste dans BullMQ + dans les `Alert.channelEmailSentAt` / `channelSmsSentAt` columns qui existent déjà.
- **D-24:** Tests = mocks via `jest.Mocked<>` pour les SDKs Brevo + Twilio. Pas de smoke réel en CI (coût + flakiness). Smoke réel manuel documenté dans SUMMARY.
- **D-25:** Frontend i18n = ajout de clés `notifications.*` dans `fr.json` (EN/AR vide v2).

### Claude's Discretion

- Nommage exact des fichiers (probablement `apps/api/src/modules/notification/{notification.module, notification.service, notification.processor, providers/brevo.provider, providers/twilio.provider, renderers/email.renderer, renderers/sms.renderer}.ts`).
- Décision entre `BullModule.forRootAsync()` vs `forRoot()` (préférer Async pour ConfigService).
- Structure des templates email (un fichier par type ou un seul switch ?).
- Tests : Jest in-memory queue (`@bull-board/api` mock) vs spawn un vrai Redis local.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & Requirements
- `.planning/ROADMAP.md` § Phase 9 — phase boundary, success criteria, dependencies
- `.planning/REQUIREMENTS.md` § NTF-01, NTF-02, NTF-03 — verbatim requirement statements

### Existing services & entities (must extend, not replace)
- `apps/api/src/modules/analytics/services/alert-dispatcher.service.ts` — current dispatcher (with stubs to replace per NTF-03)
- `apps/api/src/modules/analytics/entities/alert-rule.entity.ts` — routing config (already used)
- `apps/api/src/modules/alerts/alert.entity.ts` — `channel_email_sent_at`, `channel_sms_sent_at` columns already exist
- `apps/api/src/modules/alerts/alerts.service.ts` — exposes alerts to frontend
- `apps/api/src/modules/alerts/alerts.controller.ts` — `/api/alerts` endpoints

### Frontend integration points
- `apps/web/src/app/features/alerts-inbox/widgets/alert-badge.component.ts` — existing badge component to enrich
- `apps/web/src/app/layout/header.component.ts` — where the badge sits
- `apps/web/src/app/core/sse/sse-client.service.ts` — SSE wiring pattern (Dashboard uses it)
- `apps/web/src/assets/i18n/fr.json` — add `notifications.*` keys

### Phase 8 dependencies (already shipped)
- `.planning/phases/08-operational-alerts-closure/08-CONTEXT.md` § D-15, D-17 — alert_rule seed + event payload format
- `apps/api/src/modules/maintenance/migrations/1719100200000__phase08_seed_pm_alert_rules.sql` — alert_rule rows seeded

### Provider SDKs (versions to pin)
- `@getbrevo/brevo` (latest 2.x at planning time — verify in package.json install)
- `twilio` (latest 5.x at planning time)
- `@nestjs/bullmq` + `bullmq` (already may be installed — verify)

### Project decisions
- `.planning/PROJECT.md` — Africa/Abidjan timezone, FR-first i18n, multi-tenant RLS via CLS
- `./CLAUDE.md` — NestJS 11, TypeORM, Upstash Redis stack

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable assets
- `AlertDispatcherService.dispatch()` — current method does the alert_rule matching loop. Phase 9 swap : remplace les stub appels `logger.log()` par `notificationsQueue.add()`.
- `User` entity → has `role: GravelRole`, `siteIds: string[]`. Recipient resolver is a simple TypeORM query.
- `BullModule` may already be installed for cost-per-ton-aggregator-job ; if so, just register a new queue `notifications`.
- `AlertBadgeComponent` exists ; just needs SSE wire + click-to-mark-seen logic.
- SSE delta channel `${tenantId}:${siteId}:site-director` already broadcasts `kpi.delta` events — add a sibling delta type `alerts.delta` for badge updates OR reuse existing channel.

### Established patterns
- Job processors use `@Processor('queue-name')` from `@nestjs/bullmq`.
- Tenant context in processors : `SET LOCAL app.current_tenant = '${tenantId}'` at top of each job.
- External SDKs wrapped in dedicated `providers/<provider>.provider.ts` — never used directly in service.
- All env vars validated at startup via `ConfigModule.forRoot({ validate })`.
- Tests for processors use `jest.Mocked<Queue>` with `add.mockResolvedValue(...)`.

### Integration points
- `apps/api/src/app.module.ts` — register `BullModule.forRootAsync(...)` at root, then `NotificationModule` imports `BullModule.registerQueue({ name: 'notifications' })`.
- `AlertDispatcherService` currently in `analytics` module — keep it there ; it imports `NotificationService` for enqueue.
- Frontend SSE : existing `SseClientService.connect(...)` — Phase 9 adds a subscription on `alerts.delta` (or piggy-back on `kpi.delta`).

### Constraints discovered
- The current `AlertDispatcherService.dispatch()` re-throws errors (SF-007 fix from prior audit). Phase 9 must preserve that : `notificationsQueue.add()` failures bubble up so the caller (AlertsEventHandlers) doesn't silently mark the alert "dispatched" when no job was queued.
- `Alert.channel_email_sent_at` / `channel_sms_sent_at` columns are the "delivered" markers ; the processor MUST update them on successful send (not on enqueue).
- `gravel-erp-production` Railway service has Redis configured (`REDIS_URL`). Confirm Upstash plan supports BullMQ pub/sub (Free tier has 256MB limit + 100k commands/day — Phase 9 sizing).

</code_context>

<specifics>
## Specific Ideas

- L'utilisateur préfère les décisions défensives (idempotency via jobId, env-driven providers, sandbox modes). Pas de "we'll see if it works in prod".
- Test mode pour Brevo + Twilio = clé indispensable pour itérer sans coût ni vraies notifs.
- Frontend = polling SSE existant, pas de nouvelle infra WebSocket.
- Pas de tracking de delivery webhook entrant (différé v2) — on accepte que `channel_email_sent_at` veut juste dire "Brevo a accepté la requête", pas "le destinataire a lu".

</specifics>

<deferred>
## Deferred Ideas (v2)

- **Webhooks entrants** Brevo (bounce/delivered/opened/clicked) + Twilio (delivered/failed/replied) — nécessite un endpoint public + sécurité signature
- **Templates customizables par tenant** (admin UI pour éditer subject/body)
- **Templates multilingue** (EN/AR) — bloqué par i18n backend
- **Re-emit alertes non-acquittées** après X jours (escalation v2)
- **Push notifications mobile** (FCM/APNs) — bloqué par release Flutter
- **Webhooks externes** (Slack/Teams/Discord) — v2
- **A/B testing templates** — v2
- **Rate limiting par destinataire** au-delà de la dedupe BullMQ — v2 (BullMQ rate limiter dispo dans plus tard)
- **Bounce list management** — v2 (suppression auto des emails qui bounce > 3x)

</deferred>

---

*Phase: 09-notification-delivery*
*Context gathered: 2026-05-16 (decision-by-recommendation mode — user delegated calls)*
