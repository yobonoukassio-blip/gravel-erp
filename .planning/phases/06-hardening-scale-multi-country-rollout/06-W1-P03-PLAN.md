---
phase: 06-hardening-scale-multi-country-rollout
plan: W1-P03
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/runbooks/disaster-recovery.md
  - .planning/drills/tabletop-2026.md
autonomous: true
requirements: [HRD-MVP-03]
requirements_covered: [HRD-MVP-03]
must_haves:
  truths:
    - "An on-call engineer faced with any of the 4 named DR scenarios (DB total loss, tenant compromise, AWS region outage, BullMQ deadletter pileup) has a decision tree, recovery steps, and comms templates ready to use."
    - "Each scenario has explicit detection signal + N-minute SLA + post-mortem template (D-09)."
    - "First annual tabletop drill (DB total loss) is scheduled and templated before v1.1 cutover (D-10)."
  artifacts:
    - path: ".planning/runbooks/disaster-recovery.md"
      provides: "DR runbook covering 4 named scenarios with detection, decision tree, recovery, comms, post-mortem"
      contains: "primary DB total loss"
      contains_all:
        - "primary DB total loss"
        - "tenant data compromise"
        - "AWS region outage"
        - "BullMQ deadletter pileup"
        - "detect-in-N-minutes"
        - "post-mortem template"
        - "communication template"
    - path: ".planning/drills/tabletop-2026.md"
      provides: "Tabletop drill template + first scheduled drill record"
      contains: "scenario #1"
  key_links:
    - from: ".planning/runbooks/disaster-recovery.md"
      to: ".planning/drills/tabletop-2026.md"
      via: "Annual tabletop schedule section linking to drill record"
      pattern: "tabletop-2026"
---

<objective>
Produce the canonical Disaster Recovery Runbook (HRD-MVP-03) — 4 named scenarios from D-08 with detection, decision tree, recovery steps, communication templates, and post-mortem templates per D-09. Schedule and template the first annual tabletop drill (D-10) — scenario #1 (DB total loss) — to run before v1.1 customer cutover.

Purpose: When the system fails at 3am, the on-call engineer must not improvise. A pre-written decision tree per scenario shortens MTTR; templated client communication preserves trust; post-mortem templates ensure learning compounds across incidents. First-customer go-live demands this exists *before* anything ships to prod.

Output: `.planning/runbooks/disaster-recovery.md` + `.planning/drills/tabletop-2026.md`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/phases/06-hardening-scale-multi-country-rollout/06-CONTEXT.md
@docs/adr/ADR-0001-rls-multi-tenancy.md
@docs/adr/ADR-0004-audit-chain-of-hash.md
@CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Author disaster-recovery.md covering 4 scenarios with full structure per D-09</name>
  <files>.planning/runbooks/disaster-recovery.md</files>
  <read_first>
    - .planning/phases/06-hardening-scale-multi-country-rollout/06-CONTEXT.md (D-08, D-09, D-10)
    - docs/adr/ADR-0001-rls-multi-tenancy.md (RLS leak scenario context)
    - docs/adr/ADR-0004-audit-chain-of-hash.md (audit chain verification — used in tenant-compromise scenario)
    - CLAUDE.md (Supabase / Railway / Upstash / pgBackRest stack — recovery commands target these)
  </read_first>
  <action>
Create `.planning/runbooks/disaster-recovery.md` with this structure:

## 1. Purpose, scope, DRI
- Scope: production system (Supabase Postgres + Railway NestJS + Upstash Redis + Vercel Angular + Brevo/Twilio externals)
- DRI: on-call SRE
- Activation: any P0 incident matching one of the 4 scenarios

## 2. Severity & escalation matrix

| Severity | Definition | Page on-call | Notify customer within |
|----------|------------|--------------|------------------------|
| P0 | Production down or data loss risk | Immediate | 30 min |
| P1 | Major feature broken, no data loss | 15 min | 2 hours |
| P2 | Degraded UX, workaround exists | Business hours | Daily digest |

## 3. Scenario 1 — Primary DB total loss

### 3.1 Detection (target: ≤ 5 min)
- Prometheus alert `pg_up{instance="prod"} == 0` for 60s
- Supabase status page degradation
- API health probe `/health` returns 503 with body matching "db connection failed"

### 3.2 Decision tree
```
Is Supabase status page green?
├─ Yes → DB credentials issue → check secrets rotation log, restart API with current creds
└─ No → Confirmed DB outage
    │
    Did Supabase confirm data loss (not just downtime)?
    ├─ No → Wait for Supabase recovery; communicate to customer (P0 outage)
    └─ Yes → Execute restore (see 3.3)
```

### 3.3 Recovery steps
1. Notify customer (template §3.5)
2. Provision scratch Postgres: `terraform -chdir=infra/dr apply -var "scenario=db-restore"`
3. Restore latest pgBackRest base + WAL to PITR target T-5min: `pgbackrest --stanza=gravel-prod --type=time --target="{ISO_TIMESTAMP}" restore`
4. Verify row counts on top 10 tables match last-known-good metric (Prometheus)
5. Repoint `DATABASE_URL` env var in Railway, restart API service
6. Verify health probes green, mobile sync resumes (check `sync.success_rate` metric)
7. Run audit-chain verifier (see ADR-0004) — flag any tenant with chain break

### 3.4 RTO/RPO targets
- RTO: 1 hour (per HRD-MVP-02 D-06)
- RPO: 5 minutes (continuous WAL archive)

### 3.5 Customer communication template (initial + every 60min update + resolution)
```
SUBJECT: [Gravel Ivoire — Incident P0] Indisponibilité temporaire — initial / update / résolu

Bonjour {Customer Contact},

À {HH:MM UTC}, nous avons détecté {description neutre}. Nos équipes interviennent.
Impact: {fonctionnalités touchées}.
Prochain update: dans 60 minutes ou à la résolution.

Cordialement,
SRE Gravel Ivoire
```
(Translate to EN in same file as 2nd block — short version for expat ops directors.)

### 3.6 Post-mortem template
```
# Post-mortem: {Incident ID} — {Title}
- Date / duration
- Severity (P0/P1)
- Detection lag (signal → page → ack)
- Recovery lag (ack → resolved)
- Customer impact (tenants affected, requests dropped, data lost)
- Root cause (5-whys)
- What worked
- What didn't
- Action items (owner + due date)
```

## 4. Scenario 2 — Tenant data compromise (RLS leak)

### 4.1 Detection (target: ≤ 15 min)
- Customer reports seeing data from another tenant
- OR: audit-chain verifier flags cross-tenant row reference
- OR: query log shows missing `SET LOCAL app.current_tenant` GUC

### 4.2 Decision tree
```
Is the leak read-only or write?
├─ Read-only → freeze affected endpoint, run query forensics, communicate
└─ Write → Stop API immediately (Railway pause), restore from PITR before leak, audit, comms
```

### 4.3 Recovery steps
1. Identify offending endpoint + query (Tempo trace + Loki query log)
2. Add tenant-scope guard test (regression) + ship hotfix
3. Run cross-tenant row scanner: `pnpm --filter api ts-node scripts/scan-cross-tenant-leaks.ts`
4. Notify both tenants (impacted + source) within 2h per OHADA data protection norms
5. File incident report with compliance officer (HRD-MVP-05 audit export will surface this)
6. Re-verify ADR-0001 3-layer defense end-to-end (RLS + TenantAwareRepository + JWT→CLS→GUC)

### 4.4 RTO/RPO + comms + post-mortem
- RTO: 2h endpoint freeze max (degraded mode acceptable)
- Customer comms: template like 3.5 but lead with disclosure + remediation steps
- Post-mortem: as 3.6, with mandatory CISO sign-off

## 5. Scenario 3 — AWS region outage

### 5.1 Detection (target: ≤ 5 min)
- AWS status page indicates region degradation
- Multiple Railway / Vercel / S3 endpoints fail simultaneously
- Latency p95 > 5s

### 5.2 Decision tree
```
Is the outage in the deployed region only or multi-region?
├─ Single region → wait it out OR failover to second region (v2 only — today: wait)
└─ Multi-region (rare) → declare extended P0, communicate transparently, no failover possible in v1.1
```

### 5.3 Recovery steps (v1.1: passive)
1. Notify customers within 30 min: outage declared, ETA per AWS status
2. Stop all mobile sync writes server-side (set rate limit to 0) to prevent backpressure
3. Pause BullMQ consumers (Brevo/Twilio retries) — prevent quota burn against unreachable APIs
4. When region recovers: re-enable in reverse order (BullMQ → sync → API)
5. Audit: count dropped sync attempts, ensure PowerSync client-side retries replayed

### 5.4 v1.1 caveat
Multi-region failover is deferred to v2 (Section 6B). RTO in v1.1 = "time AWS takes to recover."

### 5.5 Comms + post-mortem (same templates)

## 6. Scenario 4 — BullMQ deadletter pileup

### 6.1 Detection (target: ≤ 10 min)
- Prometheus alert `bullmq_deadletter_count > 100` for 5 min
- OR: SLO breach on alert dispatch latency (D-17 d: p95 > 60s)

### 6.2 Decision tree
```
Is the underlying provider (Brevo/Twilio) down?
├─ Yes → pause workers, queue retains items, drain when provider recovers
└─ No → bad payload root cause → triage one deadletter item manually
    │
    Is the bad payload a coding bug?
    ├─ Yes → ship hotfix, replay deadletter via admin tool
    └─ No (data issue) → mark tenant-specific, escalate to data steward
```

### 6.3 Recovery steps
1. Inspect deadletter via `pnpm --filter api ts-node scripts/bullmq-inspect.ts --queue notifications --state failed`
2. If provider outage: pause via BullMQ admin UI (or `queue.pause()`)
3. If bug: fix + redeploy + `queue.retryFailed()`
4. If data issue: open ticket per tenant, exclude from retry
5. Document failure mode in this runbook (append to "Known failure modes" section)

### 6.4 RTO + comms
- RTO: 10 min to acknowledge, 60 min to either resume or document permanent triage path
- Customer comms only if dispatch lag exceeds 4h (then template §3.5)

## 7. Annual tabletop drill schedule (D-10)

| Year | Scenario | Date target | Record |
|------|----------|-------------|--------|
| 2026 | #1 DB total loss | Before v1.1 cutover (T-3d window) | `.planning/drills/tabletop-2026.md` |
| 2027 | #2 Tenant compromise | Q2 | TBD |
| 2028 | #3 Region outage | Q2 | TBD |
| 2029 | #4 Deadletter pileup | Q2 | TBD |

Rotate through 4 scenarios on a 4-year cycle minimum.

## 8. Known failure modes (append-only log)
_(empty initially; populated by post-mortems)_

## 9. References
- D-08, D-09, D-10 in `06-CONTEXT.md`
- ADR-0001 (RLS defense), ADR-0004 (audit chain)
- HRD-MVP-02 (backup drill — restore commands here use those artifacts)
- HRD-MVP-06 (SLOs — detection signals tie to alert rules from there)
  </action>
  <verify>
    <automated>test -f .planning/runbooks/disaster-recovery.md && grep -q "primary DB total loss" .planning/runbooks/disaster-recovery.md && grep -q "tenant data compromise" .planning/runbooks/disaster-recovery.md && grep -q "AWS region outage" .planning/runbooks/disaster-recovery.md && grep -q "BullMQ deadletter pileup" .planning/runbooks/disaster-recovery.md && grep -q "detect-in-N-minutes\|Detection (target" .planning/runbooks/disaster-recovery.md && grep -q "post-mortem template\|Post-mortem template" .planning/runbooks/disaster-recovery.md && grep -q "communication template\|Customer communication template" .planning/runbooks/disaster-recovery.md</automated>
  </verify>
  <acceptance_criteria>
    - File `.planning/runbooks/disaster-recovery.md` exists
    - All 4 D-08 scenarios present with section header per scenario
    - Each scenario has: detection (with target time), decision tree, recovery steps, RTO/RPO, comms template, post-mortem template (D-09)
    - Annual tabletop schedule table present (D-10) with scenario #1 for 2026
    - References to ADR-0001, ADR-0004, HRD-MVP-02, HRD-MVP-06
  </acceptance_criteria>
  <done>On-call engineer paged for any of the 4 named scenarios can drive incident response with the runbook as single source of truth — no improvisation, no missing comms template.</done>
</task>

<task type="auto">
  <name>Task 2: Create tabletop-2026.md drill template + 2026 scheduled session record</name>
  <files>.planning/drills/tabletop-2026.md</files>
  <read_first>
    - .planning/runbooks/disaster-recovery.md (just-created — Task 1 output, especially §7)
    - .planning/phases/06-hardening-scale-multi-country-rollout/06-CONTEXT.md (D-10)
  </read_first>
  <action>
Create `.planning/drills/tabletop-2026.md` with:

## Tabletop Drill — 2026

### Scenario for 2026
Scenario #1: Primary DB total loss (per D-10 — first tabletop before v1.1 cutover).

### Schedule
- Target date: T-3d before first paying customer cutover (date TBD; update when cutover date locked)
- Duration: 2 hours
- Format: Synchronous video call + shared doc updates in real time
- Participants: SRE on-call rota (all members), tech lead, customer success lead
- Facilitator: tech lead (non-rotating)

### Pre-drill checklist
- [ ] Latest backup drill within 30d (HRD-MVP-02)
- [ ] DR runbook scenario #1 reviewed by all participants
- [ ] Scratch infra reservation booked (Terraform target ready)
- [ ] Communication templates pre-populated with placeholders
- [ ] Stopwatch / timer ready for RTO measurement

### Drill script (90 min)
1. **T+0 (5 min)** — Facilitator announces incident: "Supabase prod went dark at HH:MM UTC, /health 503, full data loss reported."
2. **T+5 (10 min)** — On-call validates detection signals (per runbook §3.1), declares P0.
3. **T+15 (15 min)** — Decision tree traversal; team agrees on restore path.
4. **T+30 (30 min)** — Execute restore commands (against scratch infra — DO NOT touch prod).
5. **T+60 (15 min)** — Verify health, post-restore audit-chain check.
6. **T+75 (15 min)** — Customer comms drill: draft + send (to internal test email).
7. **T+90 (10 min)** — Retro: what worked, what didn't, action items.

### Success criteria
- All steps in §3.3 of disaster-recovery.md executed end-to-end
- Customer comms drafted within 30 min of detection
- Measured RTO ≤ 1h target (per D-06)
- Zero action items left unowned

### Post-drill report
After completion, populate:

| Item | Result |
|------|--------|
| Date executed | — |
| Participants | — |
| Measured detection lag | — |
| Measured RTO | — |
| Measured RPO (data lost) | — |
| Customer comms delivered within target? | Y/N |
| Audit-chain verification clean? | Y/N |
| Action items | (list with owner + due date) |
| Lessons → runbook updates | (list of PR refs) |

### References
- DR runbook: `.planning/runbooks/disaster-recovery.md` §3 + §7
- D-10 in `06-CONTEXT.md`
  </action>
  <verify>
    <automated>test -f .planning/drills/tabletop-2026.md && grep -q "scenario #1\|Scenario #1" .planning/drills/tabletop-2026.md && grep -q "Primary DB total loss" .planning/drills/tabletop-2026.md</automated>
  </verify>
  <acceptance_criteria>
    - File `.planning/drills/tabletop-2026.md` exists
    - Scenario #1 (DB total loss) named per D-10
    - Pre-drill checklist + drill script + success criteria + post-drill report sections present
    - Links back to `.planning/runbooks/disaster-recovery.md`
  </acceptance_criteria>
  <done>The 2026 tabletop drill is bookable, runnable, and reportable from a single page; participants can execute without further prep beyond reading the runbook.</done>
</task>

</tasks>

<verification>
- DR runbook covers 4 scenarios from D-08 in full.
- Tabletop drill 2026 record exists with scenario #1.
- Cross-links from runbook §7 → tabletop record.
</verification>

<success_criteria>
HRD-MVP-03 satisfied: incident response is no longer ad-hoc — every major failure mode has a runbook entry and the first annual tabletop is scheduled and templated.
</success_criteria>

<output>
After completion, create `.planning/phases/06-hardening-scale-multi-country-rollout/06-W1-P03-SUMMARY.md`.
</output>
