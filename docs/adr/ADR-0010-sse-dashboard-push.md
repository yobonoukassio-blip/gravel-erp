# ADR-0010 — SSE for dashboard push (WebSocket deferred Phase 4+)

## Status

Draft — to be refined in Wave 3 (production-dashboard module). Date: 2026-05-12. Authors: Phase 2 planner.

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

## Key tokens (audit-search anchors)

`SSE`, `Last-Event-ID`.
