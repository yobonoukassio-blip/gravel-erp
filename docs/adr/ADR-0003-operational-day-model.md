# ADR-0003 — OperationalDay as the single time-bucket for reporting

Status: Accepted | Date: 2026-05-12 | Authors: Phase 1 planner

## Context

Quarry operations span multiple time zones (Ivory Coast UTC+0,
French parent group in Europe/Paris with DST, future Maghreb sites
straddling daylight changes). Reporting "tons hauled on 2026-10-25"
must mean the **site-local operational day**, not a UTC fence-post
that splits a single overnight shift across two calendar dates.

Repo touchpoints:

- Pure helper — `apps/api/src/common/operational-day.ts` exports
  `resolveOperationalDay(timestamp, siteTimezone, dayStartHour)`.
- Unit test — `apps/api/test/unit/operational-day.spec.ts` covers
  Europe/Paris 2026-10-25 02:00 (DST fall-back) and Africa/Abidjan
  shift boundaries (FND-08).
- Schema — every reporting table has `operational_day date NOT NULL`
  populated by the resolver, never derived from `created_at::date`.
- Lint — the `no-raw-created-at-date` ESLint rule + the CI grep gate
  block `created_at::date` from appearing in `apps/api/src/**/reports/`.

The well-known DST hazard (Pitfall 9): in Europe/Paris on 2026-10-25,
local clock-time 02:00–03:00 occurs twice. A naïve
`(timestamp AT TIME ZONE 'Europe/Paris')::date` will assign half of a
single shift to 2026-10-25 and half to 2026-10-26.

## Decision

Define an **OperationalDay** value object resolved per site:

```
operational_day(t, tz, dayStartHour) :=
   floor( (t_in_tz - dayStartHour) / 24h )::date
```

with the boundary convention **`[start, end)`** — start is inclusive,
end is exclusive (Pitfall 7 — prevents the "boundary instant counted
twice" defect).

`dayStartHour` is a per-site configuration; default 06:00 local for
day-shift quarries. The resolver uses `date-fns-tz` (already in
`apps/api/package.json`) for DST-aware conversion.

**Banned**: `created_at::date` in any reporting query. Caught by:

- ESLint custom rule `gravel/no-raw-created-at-date`
  (`tools/eslint-rules/index.js`) — runs under
  `pnpm -r run lint --max-warnings=0` in CI.
- A `grep` job (`.github/workflows/test.yml#forbidden-imports`) that
  fails the PR if the pattern appears anywhere in `apps/api/src`.

## Consequences

Positive:

- Reports are deterministic across DST boundaries — verified by the
  BLOCKING `dst-test` CI gate
  (`.github/workflows/test.yml#dst-test`, env `TZ=Europe/Paris`).
- All sync events flowing through `ADR-0002` carry a server-resolved
  `operational_day`, so mobile-device clock skew does not poison
  reports.

Negative:

- Every new report writer must remember to use the resolver. The
  ESLint rule + CI gate make forgetting expensive but not impossible.
- The per-site `dayStartHour` config is one more knob ops must set.

## Alternatives Considered

- **`(created_at AT TIME ZONE site.tz)::date`** — rejected: DST
  double-count (Pitfall 9).
- **Fixed UTC date** — rejected: splits real-world shifts at
  midnight UTC, which falls inside the night shift at every African
  site.
- **End-inclusive boundaries `[start, end]`** — rejected: events at
  exactly `end` get counted twice (Pitfall 7).

## References

- D-19, D-20, D-21, D-22 —
  `.planning/phases/01-foundation/01-CONTEXT.md`
- PITFALLS Pitfall 7, 9 —
  `.planning/phases/01-foundation/01-RESEARCH.md`
- ADR-0002 — sync engine writes `operational_day` per server tick.
