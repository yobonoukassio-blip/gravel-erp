---
phase: 02-vertical-slice-production
plan: 08
type: execute
wave: 3
depends_on: ["02-W0-P01", "02-W1-P02", "02-W1-P03", "02-W2-P04", "02-W2-P05", "02-W3-P06", "02-W3-P07"]
files_modified:
  - apps/api/src/modules/production-dashboard/production-dashboard.module.ts
  - apps/api/src/modules/production-dashboard/controllers/site-director-dashboard.controller.ts
  - apps/api/src/modules/production-dashboard/controllers/quarry-chief-dashboard.controller.ts
  - apps/api/src/modules/production-dashboard/services/dashboard-aggregator.service.ts
  - apps/api/src/modules/production-dashboard/services/cost-per-ton-provisional.service.ts
  - apps/api/src/modules/production-dashboard/services/sse-broadcaster.service.ts
  - apps/api/src/modules/production-dashboard/event-handlers/dashboard-projection.handler.ts
  - apps/api/src/modules/production-dashboard/migrations/1716600000000__create_dashboard_projections.sql
  - apps/api/src/modules/production-dashboard/tests/dashboard-aggregator.spec.ts
  - apps/api/src/modules/production-dashboard/tests/cost-per-ton-provisional.spec.ts
  - apps/api/src/modules/production-dashboard/tests/sse-dashboard.spec.ts
  - apps/web/src/app/features/dashboard-site/dashboard-site.module.ts
  - apps/web/src/app/features/dashboard-site/pages/site-director-dashboard.component.ts
  - apps/web/src/app/features/dashboard-site/pages/quarry-chief-dashboard.component.ts
  - apps/web/src/app/features/dashboard-site/widgets/kpi-tile.component.ts
  - apps/web/src/app/features/dashboard-site/widgets/cost-per-ton-provisional-tile.component.ts
  - apps/web/src/app/features/dashboard-site/widgets/stockpile-gauge.component.ts
  - apps/web/src/app/features/dashboard-site/widgets/site-map.component.ts
  - apps/web/src/app/features/dashboard-site/dashboard-routes.ts
  - apps/web/src/app/features/alerts-inbox/alerts-inbox.module.ts
  - apps/web/src/app/features/alerts-inbox/pages/alerts-inbox.component.ts
  - apps/web/src/app/features/alerts-inbox/widgets/alert-badge.component.ts
  - apps/web/src/app/features/alerts-inbox/alerts-routes.ts
  - apps/web/playwright/dashboard.spec.ts
  - docs/adr/ADR-0010-sse-dashboard-push.md
autonomous: true
requirements: [DSH-01, DSH-02]

must_haves:
  truths:
    - "Le Directeur Site dispose d'un dashboard temps réel avec tonnage J/J-1/S/M, rendement forage, rendement extraction, TF, incidents ouverts, niveaux cuves, soldes stockpile vs seuils, équipements en panne"
    - "Le Chef Carrière dispose d'un dashboard plus opérationnel : plans forage actifs + progression %, équipages, anomalies hors-tolérance jour, rotations camions, file pesage"
    - "Les KPI se mettent à jour en temps réel via SSE (channel scoped par tenant_id, site_id, dashboard_key)"
    - "Le KPI cost_per_ton_provisional est affiché avec étiquette 'Provisoire (carburant uniquement — coût final Phase 4)'"
    - "La carte site Leaflet affiche zones, bancs, stockpiles, cuves carburant, derniers positions engins (manuel Phase 2)"
  artifacts:
    - path: "apps/api/src/modules/production-dashboard/services/dashboard-aggregator.service.ts"
      provides: "Aggregates KPIs across foration, extraction, transport, stockpile, fuel, hse"
    - path: "apps/api/src/modules/production-dashboard/services/sse-broadcaster.service.ts"
      provides: "SSE channel registry + emit per (tenant_id, site_id, dashboard_key)"
    - path: "apps/web/src/app/features/dashboard-site/widgets/cost-per-ton-provisional-tile.component.ts"
      provides: "UI tile with 'Provisoire' label per D2-100"
    - path: "docs/adr/ADR-0010-sse-dashboard-push.md"
      provides: "Refined ADR (Accepted)"
  key_links:
    - from: "apps/web/src/app/features/dashboard-site/pages/site-director-dashboard.component.ts"
      to: "SseClientService (W0-P01)"
      via: "sseClient.connect('/api/dashboards/site-director/stream', ...)"
      pattern: "sseClient\\.connect\\("
    - from: "apps/api/src/modules/production-dashboard/services/sse-broadcaster.service.ts"
      to: "express Response.write SSE format"
      via: "data: <json>\\n\\n"
      pattern: "data: "
    - from: "apps/api/src/modules/production-dashboard/event-handlers/dashboard-projection.handler.ts"
      to: "sseBroadcaster.emit"
      via: "@OnEvent on 6+ domain events"
      pattern: "sseBroadcaster\\.emit"
---

<objective>
Deliver Dashboard + Alertes Inbox covering DSH-01 (2 personas Phase 2: Directeur Site, Chef Carrière) and DSH-02 (KPIs production temps réel via SSE). Implement cost_per_ton_provisional with mandatory "Provisoire" UI label per D2-100. Refine ADR-0010.

Output: production-dashboard module backend with SSE broadcaster + dashboard projections + cost_per_ton_provisional service; web dashboards for 2 personas + alerts inbox + site map.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/02-vertical-slice-production/02-CONTEXT.md
@.planning/phases/02-vertical-slice-production/02-W3-P06-SUMMARY.md
@.planning/phases/02-vertical-slice-production/02-W3-P07-SUMMARY.md
@docs/adr/ADR-0010-sse-dashboard-push.md
@apps/web/src/app/core/sse/sse-client.service.ts
@apps/api/src/modules/foration/services/drilling-yield.service.ts
@apps/api/src/modules/extraction/services/extraction-yield.service.ts
@apps/api/src/modules/stockpile/services/stockpile-balance.service.ts
@apps/api/src/modules/fuel/services/fuel-anomaly.service.ts
@apps/api/src/modules/hse/services/tf-calculator.service.ts
@apps/api/src/modules/alerts/alerts.service.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Backend dashboard aggregator + cost_per_ton_provisional service</name>
  <files>
    apps/api/src/modules/production-dashboard/production-dashboard.module.ts,
    apps/api/src/modules/production-dashboard/services/dashboard-aggregator.service.ts,
    apps/api/src/modules/production-dashboard/services/cost-per-ton-provisional.service.ts,
    apps/api/src/modules/production-dashboard/controllers/site-director-dashboard.controller.ts,
    apps/api/src/modules/production-dashboard/controllers/quarry-chief-dashboard.controller.ts,
    apps/api/src/modules/production-dashboard/migrations/1716600000000__create_dashboard_projections.sql,
    apps/api/src/modules/production-dashboard/tests/dashboard-aggregator.spec.ts,
    apps/api/src/modules/production-dashboard/tests/cost-per-ton-provisional.spec.ts
  </files>
  <read_first>
    - apps/api/src/modules/foration/services/drilling-yield.service.ts (W1-P02)
    - apps/api/src/modules/extraction/services/extraction-yield.service.ts (W1-P03)
    - apps/api/src/modules/stockpile/services/stockpile-balance.service.ts (W2-P05)
    - apps/api/src/modules/hse/services/tf-calculator.service.ts (W3-P07)
    - apps/api/src/modules/fuel/entities/equipment-fuel-consumption.entity.ts (W3-P06)
    - .planning/phases/02-vertical-slice-production/02-CONTEXT.md §"D2-70, D2-72, D2-73, D2-100"
  </read_first>
  <behavior>
    - SiteDirectorDashboard GET returns: { tonnage_today_kg, tonnage_yesterday_kg, tonnage_week_kg, tonnage_month_kg, drilling_yield_m_per_h_today, extraction_yield_t_per_h_today, tf_rolling_12m, open_incidents_by_severity, fuel_tanks: [{ tank_id, label, balance_liters, pct_filled, anomalies_open }], stockpiles: [{ stockpile_id, label, balance_kg, threshold_status }], equipment_out_of_service: [...], cost_per_ton_provisional: { value_minor_units, currency, label: "Provisoire (carburant uniquement)" } }
    - QuarryChiefDashboard GET returns: { active_drilling_plans: [{ id, label, planned, drilled, progress_pct }], crews_assigned_today, tolerance_violations_today, truck_rotations_today: { total, in_progress, completed }, weighing_queue_size }
    - cost_per_ton_provisional = sum(equipment_fuel_consumption.liters * cost_per_liter) over OperationalDay window / sum(stockpile_event INFLOW tonnage in kg / 1000) for that window. Currency = site functional currency.
    - All responses RLS-scoped.
  </behavior>
  <action>
    Migration: optional projection table `dashboard_kpi_daily (tenant_id, site_id, operational_day_id, kpi_key VARCHAR(80), kpi_value_json JSONB, computed_at_utc, PRIMARY KEY (tenant_id, site_id, operational_day_id, kpi_key))` for caching aggregations.

    `DashboardAggregatorService.computeForSiteDirector(siteId, operationalDayId)`: orchestrates calls to drilling-yield, extraction-yield, stockpile-balance, fuel-anomaly, tf-calculator, alerts (count by status/severity). Returns shape above.

    `DashboardAggregatorService.computeForQuarryChief(siteId, operationalDayId)`: queries active drilling plans + count of drilled holes vs planned (progress %), tolerance_violation count from drilled_hole, rotation counts from truck_rotation, weighing queue from weighing_ticket WHERE created_at_utc > now() - 1h AND no rotation linked yet.

    `CostPerTonProvisionalService.compute(siteId, operationalDayId)`: SUM(efc.liters * fuel_tank_event.cost_per_liter_minor_units) FROM equipment_fuel_consumption efc JOIN fuel_tank_event on origin_delivery WHERE operational_day_id=X / (SUM(stockpile_event.tonnage_delta_kg WHERE event_type='STOCKPILE_INFLOW' AND operational_day_id=X) / 1000). Returns money tuple { amount_minor: bigint, currency, label: 'cost_per_ton_provisional' }.

    Controllers expose GET endpoints. RBAC via @Roles decorator: SITE_MANAGER + Direction Groupe for site-director dashboard; QUARRY_CHIEF + SITE_MANAGER for quarry-chief.

    Specs:
    - aggregator.spec: seed 1 site with 100 holes, 5 rotations totaling 50t, 2 fuel refuels totaling 800L, 1 incident severity 3 → assert dashboard payload structure + values.
    - cost-per-ton-provisional.spec: 100L gasoil @ 800 XOF/L = 80000 XOF; 10t inflow → cost_per_ton = 8000 XOF. Assert { amount_minor: 8000n, currency: 'XOF', label: 'cost_per_ton_provisional' }.
  </action>
  <verify>
    <automated>pnpm --filter=@gravel/api test -- dashboard-aggregator cost-per-ton-provisional</automated>
  </verify>
  <acceptance_criteria>
    - `production-dashboard.module.ts` exports module class
    - `dashboard-aggregator.service.ts` contains methods `computeForSiteDirector` and `computeForQuarryChief`
    - Site Director response shape contains `cost_per_ton_provisional`
    - `cost-per-ton-provisional.service.ts` returns `{ amount_minor, currency, label: 'cost_per_ton_provisional' }`
    - Spec asserts canonical 8000 XOF calculation for 100L@800 over 10t
    - Spec asserts open_incidents_by_severity grouped 1-5
    - `pnpm --filter=@gravel/api test dashboard-aggregator cost-per-ton-provisional` exits 0
  </acceptance_criteria>
  <done>Backend dashboard endpoints serve both personas with cost_per_ton_provisional label.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: SSE broadcaster + dashboard-projection handler (real-time push DSH-01)</name>
  <files>
    apps/api/src/modules/production-dashboard/services/sse-broadcaster.service.ts,
    apps/api/src/modules/production-dashboard/event-handlers/dashboard-projection.handler.ts,
    apps/api/src/modules/production-dashboard/tests/sse-dashboard.spec.ts
  </files>
  <read_first>
    - docs/adr/ADR-0010-sse-dashboard-push.md (W0-P01 draft)
    - apps/api/src/modules/foration/event-handlers/drilled-hole.handler.ts (W1-P02 — handler pattern)
    - .planning/phases/02-vertical-slice-production/02-CONTEXT.md §"D2-71"
  </read_first>
  <behavior>
    - sse-broadcaster maintains Map<channelKey, Set<Response>> where channelKey = `${tenant_id}:${site_id}:${dashboard_key}`
    - GET /dashboards/:dashboard_key/stream sets headers `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`; on client disconnect removes from Set
    - emit(channelKey, eventId, payload) writes `id: ${eventId}\ndata: ${JSON.stringify(payload)}\n\n` to each Response in Set
    - dashboard-projection.handler subscribes to: `production.foration.hole_drilled`, `production.extraction.cycle_appended`, `production.transport.rotation_completed`, `production.stockpile.event_appended`, `production.fuel.refuel_appended`, `hse.incident.created`. For each, determines impacted channelKeys and calls sseBroadcaster.emit with a delta payload describing what changed.
    - Last-Event-ID header on reconnect: replay events from in-memory buffer (last 100 per channel) or set Cache-Control to advise full refresh
  </behavior>
  <action>
    `SseBroadcasterService` implementation: registry Map, methods register(channelKey, res, lastEventId?), emit(channelKey, payload), unregister. Each channel keeps ring buffer of last 100 emitted events with monotonic eventId (numeric). On reconnect, replay events where id > lastEventId.

    `DashboardProjectionHandler`: @Injectable() class with 6 @OnEvent methods. Each computes affected channelKeys (typically `${tenantId}:${siteId}:site-director` and `${tenantId}:${siteId}:quarry-chief`) and calls broadcaster.emit with payload `{ kind: 'kpi.delta', updated_keys: ['tonnage_today_kg'], values: {...} }`.

    Controllers `site-director-dashboard.controller.ts` and `quarry-chief-dashboard.controller.ts` add GET /stream method (NestJS @Sse() or raw response handling).

    Spec sse-dashboard.spec: connect a mock EventSource client to `/dashboards/site-director/stream` with channelKey `tenant1:site1:site-director`. Emit event `production.stockpile.event_appended` → assert mock client receives `data: { kind: 'kpi.delta', ... }` within 500ms. Disconnect and reconnect with `Last-Event-ID: <prev>` → assert buffered events replayed.
  </action>
  <verify>
    <automated>pnpm --filter=@gravel/api test -- sse-dashboard</automated>
  </verify>
  <acceptance_criteria>
    - `sse-broadcaster.service.ts` contains `text/event-stream` content type
    - Service contains string `data: ` (SSE format)
    - Handler file contains 6 @OnEvent decorators (foration.hole_drilled, extraction.cycle_appended, transport.rotation_completed, stockpile.event_appended, fuel.refuel_appended, hse.incident.created)
    - Spec asserts SSE event delivered to mock client
    - Spec asserts Last-Event-ID replay
    - `pnpm --filter=@gravel/api test sse-dashboard` exits 0
  </acceptance_criteria>
  <done>SSE real-time push functional for both dashboards.</done>
</task>

<task type="auto">
  <name>Task 3: Web Site Director dashboard + Quarry Chief dashboard + site map widget</name>
  <files>
    apps/web/src/app/features/dashboard-site/dashboard-site.module.ts,
    apps/web/src/app/features/dashboard-site/dashboard-routes.ts,
    apps/web/src/app/features/dashboard-site/pages/site-director-dashboard.component.ts,
    apps/web/src/app/features/dashboard-site/pages/site-director-dashboard.component.html,
    apps/web/src/app/features/dashboard-site/pages/quarry-chief-dashboard.component.ts,
    apps/web/src/app/features/dashboard-site/pages/quarry-chief-dashboard.component.html,
    apps/web/src/app/features/dashboard-site/widgets/kpi-tile.component.ts,
    apps/web/src/app/features/dashboard-site/widgets/cost-per-ton-provisional-tile.component.ts,
    apps/web/src/app/features/dashboard-site/widgets/stockpile-gauge.component.ts,
    apps/web/src/app/features/dashboard-site/widgets/site-map.component.ts
  </files>
  <read_first>
    - apps/web/src/app/core/sse/sse-client.service.ts (W0-P01)
    - apps/web/src/app/features/stockpile/pages/stockpile-list.component.ts (W2-P05)
    - .planning/phases/02-vertical-slice-production/02-CONTEXT.md §"D2-72, D2-73, D2-91, D2-100"
  </read_first>
  <action>
    1. site-director-dashboard.component: grid layout. KPI tiles: tonnage today/yesterday/week/month, drilling yield, extraction yield, TF (label "TF (depuis lancement)" if mode='since_launch' else "TF (12 mois glissants)"), open incidents (badge by severity). Fuel tanks row of stockpile-gauge widgets. Stockpile row of stockpile-gauge widgets. Equipment out-of-service list. cost-per-ton-provisional-tile prominently displayed.
    2. quarry-chief-dashboard.component: active plans table with progress bars, tolerance violations counter (clickable to filter foration list), rotation counts, weighing queue.
    3. cost-per-ton-provisional-tile.component: TILE WITH MANDATORY label text using i18n key `dashboard.cost_per_ton_provisional_label` = "Provisoire (carburant uniquement — coût final Phase 4)". Background color amber to draw attention.
    4. stockpile-gauge: circular gauge showing balance vs threshold (green/amber/red).
    5. site-map.component: Leaflet wrapper showing zone polygons, bench markers, stockpile markers, fuel tank markers; current Phase 2 = static positions (no live telematics).
    All pages subscribe to SseClientService for live updates.
  </action>
  <verify>
    <automated>pnpm --filter=@gravel/web build &amp;&amp; pnpm --filter=@gravel/web test -- dashboard-site --passWithNoTests</automated>
  </verify>
  <acceptance_criteria>
    - `dashboard-site.module.ts` exports `class DashboardSiteModule`
    - `cost-per-ton-provisional-tile.component.html` contains string `Provisoire` OR i18n key `dashboard.cost_per_ton_provisional_label`
    - site-director-dashboard.component.ts imports `SseClientService` and subscribes
    - site-map.component.ts imports leaflet
    - `pnpm --filter=@gravel/web build` exits 0
  </acceptance_criteria>
  <done>Both dashboards visible + cost_per_ton_provisional UI label mandatory rendered.</done>
</task>

<task type="auto">
  <name>Task 4: Alerts Inbox web module + badge + Playwright e2e</name>
  <files>
    apps/web/src/app/features/alerts-inbox/alerts-inbox.module.ts,
    apps/web/src/app/features/alerts-inbox/alerts-routes.ts,
    apps/web/src/app/features/alerts-inbox/pages/alerts-inbox.component.ts,
    apps/web/src/app/features/alerts-inbox/pages/alerts-inbox.component.html,
    apps/web/src/app/features/alerts-inbox/widgets/alert-badge.component.ts,
    apps/web/playwright/dashboard.spec.ts
  </files>
  <read_first>
    - apps/api/src/modules/alerts/alerts.controller.ts (W0-P01)
    - apps/web/src/app/features/dashboard-site/pages/site-director-dashboard.component.ts (Task 3)
    - apps/web/src/app/core/sse/sse-client.service.ts (W0-P01)
  </read_first>
  <action>
    1. alerts-inbox: AG Grid with columns severity (color badge), source_event_type, created_at, payload summary, recipients, status (open/acked/resolved), age. Action buttons Ack and Resolve.
    2. alert-badge: counter widget displayed in app shell header, subscribes to SSE channel `alerts:${tenant_id}:${site_id}` for live count of open alerts.
    3. playwright dashboard.spec.ts: navigate to site director dashboard, mock/inject a `production.stockpile.threshold_crossed` server-side event, assert KPI tile updates within 5s, assert alert badge increments, navigate to alerts-inbox, click Ack on the new alert, assert badge decrements.
  </action>
  <verify>
    <automated>pnpm --filter=@gravel/web playwright test dashboard</automated>
  </verify>
  <acceptance_criteria>
    - `alerts-inbox.module.ts` exports `class AlertsInboxModule`
    - `alert-badge.component.ts` subscribes to SSE alerts channel
    - alerts-inbox.component.html contains `<ag-grid-angular`
    - playwright spec contains `page.goto` and asserts on alert count
    - `pnpm --filter=@gravel/web playwright test dashboard` exits 0
  </acceptance_criteria>
  <done>DSH-01 + alert badge live; e2e proves end-to-end push.</done>
</task>

<task type="auto">
  <name>Task 5: Refine ADR-0010 SSE dashboard push</name>
  <files>docs/adr/ADR-0010-sse-dashboard-push.md</files>
  <read_first>
    - docs/adr/ADR-0010-sse-dashboard-push.md (W0-P01 draft)
    - apps/api/src/modules/production-dashboard/services/sse-broadcaster.service.ts (Task 2)
  </read_first>
  <action>
    Promote to Accepted. Add `## Implementation Notes`: channelKey scheme `tenant_id:site_id:dashboard_key`, Last-Event-ID replay buffer (100 events), 6 domain events subscribed, fallback polling 30s, deferred WebSocket to Phase 4+, performance: tested with 50 concurrent clients per channel.
  </action>
  <verify>
    <automated>node -e "const c=require('fs').readFileSync('docs/adr/ADR-0010-sse-dashboard-push.md','utf8'); if(!c.includes('Accepted')||!c.includes('Implementation Notes')||!c.includes('Last-Event-ID')||!c.includes('channelKey')){console.error('missing');process.exit(1);}console.log('OK')"</automated>
  </verify>
  <acceptance_criteria>
    - ADR Status `Accepted`
    - ADR contains `## Implementation Notes`
    - ADR mentions `Last-Event-ID` and `channelKey`
  </acceptance_criteria>
  <done>ADR-0010 Accepted.</done>
</task>

</tasks>

<verification>
- Backend dashboard endpoints tested
- SSE push tested with mock client
- Web dashboards build
- Playwright e2e passes (dashboard updates live, badge increments/decrements)
- cost_per_ton_provisional label visible in UI
- ADR-0010 Accepted
</verification>

<success_criteria>
- DSH-01 and DSH-02 covered
- 2 personas Phase 2 functional (Site Director + Quarry Chief)
- cost_per_ton_provisional with mandatory "Provisoire" label
- Real-time push via SSE working end-to-end
</success_criteria>

<output>
After completion, create `.planning/phases/02-vertical-slice-production/02-W3-P08-SUMMARY.md`.
</output>
