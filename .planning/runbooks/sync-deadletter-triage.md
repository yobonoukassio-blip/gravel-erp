# Sync Deadletter Triage SOP (HRD-MVP-07, D-21)

**Owner:** Tech Lead
**Last review:** 2026-05-17
**Review cadence:** Quarterly + after every major sync incident

---

## 1. Audience

- **Primary:** Chef Maintenance (site-level, `MAINTENANCE` role)
- **Secondary:** SRE on-call (platform-level, `DIRECTION_GROUPE` role — cross-tenant break-glass)

> Role mapping note: the v1.0 `GravelRole` union does not yet include a
> dedicated `PLATFORM_ADMIN`. Cross-tenant break-glass is performed by a
> `DIRECTION_GROUPE` user. See
> `apps/api/src/modules/sync/sync-deadletter.controller.ts` deviation note.

## 2. What is a deadletter?

When a mobile sync write cannot reconcile after PowerSync's retry policy
exhausts (default: 5 attempts with exponential backoff), the item lands in
the **ConflictRegistry** — a per-tenant table of "writes the system could
not safely apply automatically." Typical causes:

- Server-side row mutated between offline submit + retry
- Validation rule changed between submit and apply
- Tenant-scope mismatch (rare; usually a client bug)
- Append-only event uniqueness violation (FND-11 idempotency check missed)

## 3. Where does it surface?

| Surface                                                    | Visibility                              | Latency           |
| ---------------------------------------------------------- | --------------------------------------- | ----------------- |
| **In-app notification badge (Phase 9 NTF-03)**             | All assigned MAINTENANCE + DIRECTION_GROUPE users | < 60s (SLO-D)     |
| **Sync Deadletter dashboard panel** (web Angular)          | Site-scoped                             | Real-time SSE     |
| **Email digest** (every 4h via NotificationService)        | tenant.compliance_email                 | < 4h              |
| **Prometheus alert** `bullmq_deadletter_count > 100`       | SRE on-call (Grafana OnCall)            | 5 min             |

## 4. Triage decision tree

```
A deadletter appears for tenant X.

Q1: How many items affected?
├─ 1-5    → individual triage (see Q2)
└─ > 5    → escalate to SRE (likely systemic — see §6)

Q2: Inspect the item — what was the conflict?
├─ Server-side mutation (timestamps differ) → check audit log; decide accept vs reject
├─ Validation rule change                   → apply current rule; replay if compatible
└─ Tenant scope mismatch                    → REJECT + open incident ticket (potential client bug)

Q3: Decision?
├─ Accept (server takes client's value) → POST /api/sync/deadletter/:id/replay
├─ Reject (server keeps current)        → POST /api/sync/deadletter/:id/discard (TBD endpoint)
└─ Escalate                             → notify SRE in #sync-deadletter Slack channel
```

## 5. Manual replay — the action

### 5.1 Via web UI

1. Navigate **Maintenance → Sync Deadletter** (sidebar item)
2. Select the row
3. Inspect "Server current" vs "Client submitted" diff
4. Click **Replay** (requires `MAINTENANCE` role)
5. Confirm — system creates new sync attempt

### 5.2 Via API — batch or programmatic

```bash
curl -X POST https://{api}/api/sync/deadletter/{deadletter_id}/replay \
  -H "Authorization: Bearer {jwt}"
# Returns: { "replayed": true, "newAttemptId": "..." }
```

Endpoint: `POST /api/sync/deadletter/:id/replay`
Source: `apps/api/src/modules/sync/sync-deadletter.controller.ts`

**RBAC:** `MAINTENANCE` (own-tenant only) or `DIRECTION_GROUPE` (cross-tenant).

**Failure modes:**

| Status | Meaning                                                        |
| ------ | -------------------------------------------------------------- |
| 200    | Replay accepted, `newAttemptId` returned                       |
| 403    | Caller role not in {MAINTENANCE, DIRECTION_GROUPE} OR cross-tenant attempt by non-DIRECTION_GROUPE |
| 404    | Deadletter id unknown OR ConflictRegistry not yet wired (v1.0 stub) |

## 6. Systemic deadletter pileup → DR runbook §6 (Scenario 4)

> 5 items in < 10 min → SRE escalation. Cross-reference:
> `.planning/runbooks/disaster-recovery.md` §6 ("BullMQ deadletter pileup").

## 7. Audit obligation

Every replay / discard creates an audit-log entry per **ADR-0004**
(chain-of-hash audit trail). The compliance officer can review via the
quarterly export (HRD-MVP-05 — `GET /api/audit/export`).

## 8. Crash-rate budget (D-22)

Mobile session crash rate target: **< 0.5%** on rugged-Android target devices
(Crosscall, Caterpillar S62, Ulefone Armor).

- Measured monthly via aggregated PowerSync client telemetry
- If exceeded: triage as **P1** (not P0) — feature freeze on the sync module
  until root cause is identified
- Reported in the production health dashboard (HRD-MVP-06 / D-18)

## 9. SOP review cadence

- Quarterly review by tech lead
- Update after every major sync incident (post-mortem feedback)
- Re-validate against the chaos extended spec output (see §10)

## 10. References

- **D-20, D-21, D-22** in `.planning/phases/06-hardening-scale-multi-country-rollout/06-CONTEXT.md`
- **ADR-0002** — PowerSync engine
- **ADR-0009** — Weighing-ticket offline numbering (most race-prone surface)
- **ADR-0004** — Audit chain-of-hash
- **DR runbook** §6 — `.planning/runbooks/disaster-recovery.md`
- **SLO definitions** — `.planning/runbooks/slo-definitions.md` (SLO-B sync success rate, SLO-D convergence)
- **Chaos spec** — `apps/api/test/chaos/sync-chaos-extended.spec.ts` (1000 × 100 × 30% load profile)
- **Weekly CI** — `.github/workflows/sync-chaos.yml`

### Follow-ups (tracked outside this SOP)

1. **Ingress wiring:** the extended chaos spec drives an in-memory simulator
   (`runHarness` in `apps/api/test/chaos/sync-chaos-harness.ts`). Real
   PowerSync ingress wiring lands when the integration ships — single
   substitution point.
2. **`DeadletterRegistry` provider:** `SyncDeadletterController` injects the
   registry as `@Optional()`; calls currently return 404 with a clear
   message. Concrete provider lands with the ConflictRegistry persistence
   migration.
3. **`POST /api/sync/deadletter/:id/discard`:** companion endpoint for the
   reject branch in §4. Out of scope for HRD-MVP-07; tracked in v1.1 backlog.
