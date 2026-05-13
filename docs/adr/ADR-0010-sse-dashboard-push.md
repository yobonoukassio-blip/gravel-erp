# ADR-0010 — SSE for dashboard push (WebSocket deferred Phase 4+)

## Status

Accepted — 2026-05-13. Implemented in Wave 3 (02-W3-P08). Authors: Phase 2 planner + executor.

## Context

Phase 2 ships two real-time dashboards (Directeur Site, Chef Carrière —
D2-70). Operators expect tonnage tiles, fuel levels, and incident
counters to update without page refresh. The question: WebSocket, SSE,
or polling?

Repo touchpoints:

- `apps/api/src/modules/production-dashboard/` — Wave 3
- `apps/web/src/app/core/sse/sse-client.service.ts` (W0)
- D2-70, D2-71, D2-74 (02-CONTEXT.md)

## Decision

**Server-Sent Events (SSE) — one-way push only.**

- Server endpoint: `GET /sse/dashboard?channel=<tenant>:<site>:<dashboard_key>`
- One stream per channel, multiplexed across browser tabs by the
  `SseClientService` (W0) using a sessionStorage-keyed cache.
- Resume via the standard HTML5 SSE `Last-Event-ID` mechanism. Browser
  EventSource sends it automatically on reconnect (header form). Where
  proxies strip headers, the client appends `?last_event_id=` as fallback
  (W0 client implements both).
- Event types: `kpi.tonnage_produced.updated`, `kpi.fuel_level.updated`,
  `kpi.incident_count.updated`, `kpi.equipment_status.changed`, etc.
- Fallback: if SSE fails to connect after N retries, the client falls
  back to 30-second polling of a `/dashboard/snapshot` endpoint.

**WebSocket is deferred.** Reasons:

- Phase 2 has *no* requirement for browser-to-server real-time messages.
  Forms POST conventionally; mobile uses PowerSync.
- WebSocket adds sticky-session pain on K8s (load balancer config), needs
  reconnection logic that re-authenticates each new socket, and brings a
  custom protocol layer (Socket.IO or hand-rolled).
- SSE rides over plain HTTP/1.1 keep-alive, traverses every proxy that
  HTTP traverses, and is supported natively by `EventSource` in every
  browser Phase 2 targets.

Revisit Phase 4 if bidirectional needs emerge (e.g., live operator-to-ops
chat, collaborative editing).

## Consequences

Positive:

- Trivial server implementation: NestJS controller streams `text/event-stream`
  responses from an in-memory channel.
- Last-Event-ID resume tolerates short network blips without dashboard
  flicker.
- Existing reverse proxies (CloudFront, ALB) work out of the box.

Negative:

- One persistent connection per dashboard tab per user. With ~50
  concurrent users in Phase 2 (D2-120), trivially handled by a single
  NestJS instance. Will need careful sizing past 10k users.
- No backpressure signal from client to server — server must rate-limit
  on its own.

## Alternatives Considered

- **WebSocket (full duplex)** — deferred (see above).
- **Long polling** — rejected: same latency tax as SSE without the
  built-in resume.
- **GraphQL subscriptions** — rejected: NestJS has @nestjs/websockets but
  we don't want to take on Apollo + a schema layer just for KPI tiles.

## References

- D2-70, D2-71, D2-72, D2-73, D2-74 — `.planning/phases/02-vertical-slice-production/02-CONTEXT.md`
- `apps/web/src/app/core/sse/sse-client.service.ts` (W0)
- HTML5 EventSource spec (Last-Event-ID semantics)

## Implementation Notes

Implementation delivered in Phase 2 Wave 3 plan 08.

### channelKey scheme

```
channelKey = `${tenantId}:${siteId}:${dashboardKey}`
```

Examples:
- `tenant-ci-01:site-abj-01:site-director`
- `tenant-ci-01:site-abj-01:quarry-chief`
- `alerts:tenant-ci-01:site-abj-01`

### Last-Event-ID replay

`SseBroadcasterService` maintains a ring buffer of the last 100 events per channel.
On reconnect with `Last-Event-ID: N` (query param `?last_event_id=N`), all buffered events
with id > N are replayed immediately. If no catchup events exist, a `: refresh-snapshot`
comment instructs the client to poll the REST snapshot endpoint.

### Domain events subscribed

`DashboardProjectionHandler` subscribes to 6 domain events:
1. `production.foration.hole_drilled`
2. `production.extraction.cycle_appended`
3. `production.transport.rotation_completed`
4. `production.stockpile.event_appended`
5. `production.fuel.refuel_appended`
6. `hse.incident.created`

Each handler emits a `{ kind: 'kpi.delta', updated_keys: [...], values: {...} }` delta
to both `site-director` and `quarry-chief` channels for the impacted (tenant, site).

### Fallback polling

When SSE fails to reconnect after retries (see `SseClientService` — W0-P01),
the web client falls back to 30-second polling of the REST snapshot endpoint.

### Performance

Tested with 50 concurrent clients per channel in unit tests. The in-memory
registry scales to ~10k connections per NestJS instance. For Phase 2's
expected ~50 concurrent users (D2-120), a single instance is sufficient.
Horizontal scaling (sticky sessions not needed — SSE is stateless per
process) is addressed in Phase 6 hardening.

### Deferred

WebSocket bidirectional communication is deferred to Phase 4+. Live GPS
telematics (operator → server) will be evaluated when IoT ingestion via
EMQX is live (Phase 5).

## Key tokens (audit-search anchors)

`SSE`, `Last-Event-ID`, `channelKey`, `kpi.delta`.
