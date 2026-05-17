# Disaster Recovery Runbook

**Owner:** SRE on-call
**Last reviewed:** 2026-05-17
**Source of truth for:** HRD-MVP-03 (D-08, D-09, D-10)
**Read at 3am — no improvisation.**

---

## 1. Purpose, scope, DRI

- **Purpose:** Single source of truth for incident response on the 4 named P0 disaster scenarios. Pre-written decision trees shorten MTTR; templated communication preserves customer trust; post-mortem templates make learning compound.
- **Scope:** Production system — Supabase Postgres + Railway NestJS + Upstash Redis + Vercel Angular + Brevo (email) + Twilio (SMS) externals.
- **DRI (Directly Responsible Individual):** SRE on-call (rotating). Escalation: tech lead.
- **Activation:** Any P0 incident matching one of the 4 named scenarios. For unnamed P0 incidents, declare P0 and improvise — then file a post-mortem proposing a new runbook section.

---

## 2. Severity & escalation matrix

| Severity | Definition                                              | Page on-call    | Notify customer within |
| -------- | ------------------------------------------------------- | --------------- | ---------------------- |
| P0       | Production down OR data loss risk OR tenant compromise  | Immediate       | 30 min                 |
| P1       | Major feature broken, no data loss                      | 15 min          | 2 hours                |
| P2       | Degraded UX, workaround exists                          | Business hours  | Daily digest           |

**Page channel (v1.1):** Grafana OnCall (FOSS) → SMS + email + push. Backup: WhatsApp group "Gravel SRE P0".

---

## 3. Scenario 1 — Primary DB total loss (primary DB total loss)

### 3.1 Detection (target: ≤ 5 min)

Signals (any one triggers P0):
- Prometheus alert `pg_up{instance="prod"} == 0` for 60s
- Supabase status page reports degradation or incident in our project region
- API health probe `GET /health` returns 503 with body matching `"db connection failed"`
- BullMQ workers fail bulk with `ECONNREFUSED` to Postgres

### 3.2 Decision tree

```
Is Supabase status page green?
├─ Yes → DB credentials / connectivity issue
│        └─ Check secrets rotation log (last 24h)
│           ├─ Rotation happened → restart API with current creds, verify
│           └─ No recent rotation → check Railway network egress / Supabase IP allowlist
│
└─ No → Confirmed Supabase outage
         │
         Did Supabase confirm DATA LOSS (not just downtime)?
         ├─ No (downtime only) → Wait for Supabase recovery
         │                       Communicate P0 outage to customers (template §3.5)
         │                       Resume normal ops once green
         │
         └─ Yes (data loss) → Execute restore from pgBackRest (see §3.3)
                              Coordinate with Supabase support in parallel
```

### 3.3 Recovery steps (RTO: 1h)

1. **T+0** — Notify on-call + tech lead. Open incident channel `#inc-YYYYMMDD-db-loss`.
2. **T+5** — Notify customer using template §3.5 (initial).
3. **T+10** — Provision scratch Postgres (new Supabase project or Railway-managed pg): `terraform -chdir=infra/dr apply -var "scenario=db-restore"`.
4. **T+15** — Restore latest pgBackRest base backup + WAL to PITR target `T-5min`:
   ```bash
   pgbackrest --stanza=gravel-prod --type=time \
     --target="{ISO_TIMESTAMP_T_MINUS_5MIN}" \
     restore
   ```
5. **T+30** — Verify row counts on top 10 tables match last-known-good Prometheus metric (`pg_table_rows{table=~"..."}`):
   - `tenant`, `user`, `site`, `weighing_ticket`, `audit_entry`, `hse_incident`, `extraction_event`, `equipment`, `maintenance_order`, `notification_log`
6. **T+40** — Repoint `DATABASE_URL` env var in Railway → restart API service.
7. **T+45** — Verify health probes green (`/health` 200), mobile sync resumes (`sync.success_rate` metric > 99%).
8. **T+50** — Run audit-chain verifier (per ADR-0004) across all tenants:
   ```bash
   pnpm --filter api ts-node scripts/audit-chain-verify.ts --all-tenants
   ```
   Flag any tenant with chain break → tag for individual notification (template §3.5 with disclosure).
9. **T+60** — Send resolution comms (template §3.5 final).
10. **T+60..+24h** — Monitor for residual issues. Open post-mortem doc (template §3.6).

### 3.4 RTO / RPO targets

- **RTO:** 1 hour (per HRD-MVP-02 D-06)
- **RPO:** 5 minutes (continuous WAL archive to S3 every ≤ 5min)
- If measured RTO > 1h or RPO > 5min → mandatory post-mortem action item to close the gap.

### 3.5 Customer communication template

Send in **FR (primary)** + **EN (short, for expat ops directors)**. One email per tenant `compliance_email`.

**FR (initial / update / résolu):**
```
SUBJET: [Gravel Ivoire — Incident P0] Indisponibilité temporaire — {initial|update|résolu}

Bonjour {Customer Contact},

À {HH:MM UTC} le {YYYY-MM-DD}, nous avons détecté {description neutre : "une indisponibilité de notre base de données primaire"}.
Nos équipes interviennent activement pour restaurer le service.

Impact : {fonctionnalités touchées — ex. "saisie web + tableaux de bord ; la saisie mobile fonctionne en mode hors-ligne et se synchronisera automatiquement à la reprise"}.
Statut actuel : {détection | restauration en cours | service rétabli}.

Prochain update : dans 60 minutes ou à la résolution complète.

Une note post-incident détaillée sera publiée sous 48h.

Cordialement,
Équipe SRE — Gravel Ivoire
```

**EN (short):**
```
SUBJECT: [Gravel Ivoire — P0 Incident] Service disruption — {initial|update|resolved}

Hello {Customer Contact},

At {HH:MM UTC} on {YYYY-MM-DD}, we detected {neutral description}. Our team is actively working on recovery.

Impact: {affected features}.
Current status: {detected | recovering | resolved}.
Next update: in 60 minutes or at full resolution.

A detailed post-incident report will follow within 48h.

Regards,
SRE Team — Gravel Ivoire
```

**Cadence:** initial within 30 min of detection, update every 60 min, resolution comms at green health, post-mortem within 48h.

### 3.6 Post-mortem template

```
# Post-mortem: {Incident ID} — {Title}

## Summary
- Date / duration
- Severity: P0
- Scenario: Primary DB total loss

## Timeline
- Detection lag (signal → page → ack)
- Recovery lag (ack → resolved)
- Total customer impact window

## Customer impact
- Tenants affected (count + names)
- Requests dropped / failed sync attempts
- Data lost (rows, time window) — quantified from RPO measurement

## Root cause (5-whys)
1. ...
2. ...
3. ...
4. ...
5. ...

## What worked
- ...

## What didn't
- ...

## Action items
| # | Action | Owner | Due |
|---|--------|-------|-----|
| 1 | ... | ... | ... |

## Sign-off
- SRE on-call: ...
- Tech lead: ...
- (CISO if data exposure): ...
```

---

## 4. Scenario 2 — Tenant data compromise (RLS leak) — tenant data compromise

### 4.1 Detection (target: ≤ 15 min)

Signals (any one triggers P0):
- Customer reports seeing data from another tenant in their UI
- Audit-chain verifier flags cross-tenant row reference (`tenant_id` mismatch between row and chain context)
- Query log (Loki) shows queries executing without `SET LOCAL app.current_tenant` GUC
- Pen-test or chaos test surfaces a query that bypasses the 3-layer defense (RLS + TenantAwareRepository + JWT→CLS→GUC, per ADR-0001)

### 4.2 Decision tree

```
Is the leak READ-ONLY or WRITE?
├─ Read-only → Freeze affected endpoint (toggle feature flag OFF)
│              Run query forensics (Tempo trace + Loki query log)
│              Identify scope (which tenants saw which data)
│              Communicate disclosure + remediation (template §4.4)
│
└─ Write → IMMEDIATE Railway pause (stop API service)
            Restore from PITR to T-(leak_start - 5min)
            Audit which writes survived
            Re-apply legitimate writes manually if recoverable
            Communicate disclosure + remediation + potential data inconsistency
            CISO sign-off mandatory
```

### 4.3 Recovery steps (RTO: 2h endpoint freeze max)

1. **T+0** — Page on-call + tech lead + CISO (or designated security lead).
2. **T+5** — Identify offending endpoint + query via Tempo trace ID and Loki query log:
   ```bash
   # Find queries missing GUC
   logcli query '{app="api"} |= "BEGIN" !~ "SET LOCAL app.current_tenant"'
   ```
3. **T+15** — Freeze offending endpoint (NestJS feature-flag guard, or Railway route disable). Read-only leak only.
4. **T+30** — Write hotfix branch: add `@RequireTenantContext()` guard + regression test that fails without GUC.
5. **T+45** — Run cross-tenant row scanner:
   ```bash
   pnpm --filter api ts-node scripts/scan-cross-tenant-leaks.ts
   ```
6. **T+60** — Notify BOTH tenants (impacted + source) per OHADA data protection norms — initial disclosure within 2h, full report within 72h.
7. **T+90** — File compliance incident report (HRD-MVP-05 audit export surfaces evidence trail).
8. **T+120** — Re-verify ADR-0001 3-layer defense end-to-end with chaos test:
   ```bash
   pnpm --filter api test:chaos -- rls-defense
   ```
9. **T+120..+72h** — Open post-mortem with mandatory CISO sign-off.

### 4.4 RTO / RPO + comms

- **RTO:** Endpoint freeze ≤ 2h (degraded mode acceptable to prevent further leak)
- **RPO:** Read-only = no data loss (read-side only); Write = up to leak window restored from PITR
- **Customer comms:** Same template as §3.5 BUT lead with disclosure paragraph:
  ```
  IMPORTANT — disclosure : entre {start_time} et {end_time}, une faille de cloisonnement a permis
  à {N} utilisateur(s) d'un autre tenant d'accéder à {scope} de vos données.
  Aucune écriture / Des écritures (rollback effectué) ont été observées.
  Mesures prises : {gel endpoint, hotfix, audit complet}.
  Rapport détaillé sous 72h conformément aux exigences OHADA.
  ```

### 4.5 Post-mortem template

Same as §3.6, plus:
- Mandatory CISO sign-off line
- ADR-0001 3-layer defense audit results attached
- Affected tenant list + disclosure timestamps

---

## 5. Scenario 3 — AWS region outage

### 5.1 Detection (target: ≤ 5 min)

Signals (any one triggers P0):
- AWS status page indicates degradation in our deployed region (eu-west-3 or af-south-1)
- Multiple Railway / Vercel / S3 endpoints fail simultaneously
- API p95 latency > 5s for > 2 min
- Health probes from multiple regions report failure

### 5.2 Decision tree

```
Is the outage in our deployed region ONLY or MULTI-REGION?
├─ Single region (our region affected)
│   └─ v1.1: We have no failover. Wait it out.
│      ├─ Communicate P0 (template §3.5) with AWS status link
│      ├─ Stop mobile-sync writes server-side (set rate limit to 0)
│      ├─ Pause BullMQ consumers (Brevo/Twilio retries)
│      └─ When recovered: re-enable in reverse order (BullMQ → sync → API)
│
└─ Multi-region (rare)
    └─ Declare extended P0, communicate transparently
       v1.1: no failover possible; wait for AWS
       Document for v2 multi-region planning (Section 6B)
```

### 5.3 Recovery steps (v1.1: passive — no failover capability)

1. **T+0** — Verify outage scope on AWS status page + Downdetector. Confirm it's not our config error.
2. **T+5** — Notify customers within 30 min target (template §3.5) — outage declared, ETA per AWS status page.
3. **T+10** — Stop all mobile sync writes server-side: set PowerSync rate limit to 0 via admin API. Prevents client retries from pummeling broken backend + queueing on local SQLite (PowerSync handles offline gracefully).
4. **T+15** — Pause BullMQ consumers (Brevo/Twilio retries) — prevents quota burn against unreachable third-party APIs:
   ```bash
   pnpm --filter api ts-node scripts/bullmq-pause.ts --queue notifications
   ```
5. **T+N** — Monitor AWS status. When region recovers:
   - Verify Postgres/Redis/S3 reachable
   - Re-enable in reverse: BullMQ resume → sync rate limit restore → API health check
6. **T+N+30** — Audit: count dropped sync attempts (Prometheus counter), verify PowerSync client-side retries replayed successfully.
7. **T+N+60** — Send resolution comms.

### 5.4 v1.1 caveat (explicit)

Multi-region failover is **deferred to v2** (Section 6B — `HRD-multi-region`). RTO in v1.1 = **"time AWS takes to recover."**

Customer-facing language: "Notre infrastructure repose sur AWS pour l'instant ; un plan de failover multi-région est planifié pour 2027."

### 5.5 RTO / RPO + comms + post-mortem

- **RTO:** Dependent on AWS recovery (typically < 4h for regional events)
- **RPO:** Zero data loss (PowerSync queues offline writes locally; sync replays on recovery)
- **Comms:** template §3.5
- **Post-mortem:** template §3.6 — focus action items on whether v2 multi-region timeline should accelerate

---

## 6. Scenario 4 — BullMQ deadletter pileup

### 6.1 Detection (target: ≤ 10 min)

Signals (any one triggers P0):
- Prometheus alert `bullmq_deadletter_count > 100` for 5 min
- SLO breach on alert dispatch latency (D-17 d: p95 > 60s from event emit to email/SMS sent)
- Customer reports missing notifications (HSE alert, weighing-ticket confirmation, maintenance reminder)

### 6.2 Decision tree

```
Is the underlying provider (Brevo/Twilio) down?
├─ Yes (provider outage)
│   └─ Pause workers — queue retains items
│      Drain when provider recovers
│      Comms only if dispatch lag > 4h
│
└─ No (provider healthy) — bad payload, root cause needed
    └─ Triage one deadletter item manually
       │
       Is the bad payload a CODING BUG?
       ├─ Yes (e.g., serialization error, schema mismatch)
       │   └─ Ship hotfix → replay deadletter via admin tool
       │
       └─ No (DATA issue, e.g., missing tenant email, bad phone format)
           └─ Mark tenant-specific
              Escalate to data steward
              Exclude from retry, document in Known Failure Modes (§8)
```

### 6.3 Recovery steps (RTO: 60min to resume or document path)

1. **T+0** — Acknowledge alert. Open incident channel.
2. **T+5** — Inspect deadletter queue:
   ```bash
   pnpm --filter api ts-node scripts/bullmq-inspect.ts \
     --queue notifications --state failed --limit 10
   ```
3. **T+10** — Check provider status: Brevo status page, Twilio status page.
4. **T+15** — Branch on decision tree:
   - **Provider outage:** Pause workers, wait. Set monitoring alert at 4h mark to trigger customer comms if not resolved.
     ```bash
     pnpm --filter api ts-node scripts/bullmq-pause.ts --queue notifications
     ```
   - **Coding bug:** Hotfix → redeploy → replay:
     ```bash
     pnpm --filter api ts-node scripts/bullmq-replay-failed.ts --queue notifications
     ```
   - **Data issue:** Open ticket per affected tenant, exclude from retry:
     ```bash
     pnpm --filter api ts-node scripts/bullmq-deadletter-exclude.ts --job-id {ID}
     ```
5. **T+60** — Either queue drained OR triage path documented for each remaining item.
6. **T+60..+24h** — Append new failure mode to §8 Known Failure Modes; open post-mortem.

### 6.4 RTO / RPO + comms

- **RTO:** 10 min ack, 60 min to resume or document permanent triage path
- **RPO:** Zero notification loss (deadletter retains payload; manual replay always possible)
- **Customer comms:** Only if dispatch lag exceeds 4h → template §3.5 with subject "Retard dans la diffusion des notifications"

### 6.5 Post-mortem template

Same as §3.6, plus:
- Failure mode categorized (provider / bug / data)
- Update to §8 Known Failure Modes attached

---

## 7. Annual tabletop drill schedule (D-10)

Rotate through 4 scenarios on a 4-year cycle minimum. Run before each major release if release introduces material risk to a scenario.

| Year | Scenario                                | Date target                              | Drill record                              |
| ---- | --------------------------------------- | ---------------------------------------- | ----------------------------------------- |
| 2026 | #1 Primary DB total loss                | Before v1.1 cutover (T-3d window)        | `.planning/drills/tabletop-2026.md`       |
| 2027 | #2 Tenant data compromise (RLS leak)    | Q2                                       | TBD (`.planning/drills/tabletop-2027.md`) |
| 2028 | #3 AWS region outage                    | Q2                                       | TBD (`.planning/drills/tabletop-2028.md`) |
| 2029 | #4 BullMQ deadletter pileup             | Q2                                       | TBD (`.planning/drills/tabletop-2029.md`) |

**First drill:** see `.planning/drills/tabletop-2026.md` for the 2026 DB-loss tabletop template and post-drill report slots.

---

## 8. Known failure modes (append-only log)

_Populated by post-mortems. Each entry: date, scenario, failure mode, mitigation, link to post-mortem._

| Date | Scenario | Failure mode | Mitigation | Post-mortem |
| ---- | -------- | ------------ | ---------- | ----------- |
| _(empty — to be populated as incidents occur)_ | | | | |

---

## 9. References

- **D-08, D-09, D-10** — Phase 6 decisions in `.planning/phases/06-hardening-scale-multi-country-rollout/06-CONTEXT.md`
- **ADR-0001** — RLS multi-tenancy 3-layer defense (`docs/adr/ADR-0001-rls-multi-tenancy.md`) — scenario #2 context
- **ADR-0004** — audit chain-of-hash (`docs/adr/ADR-0004-audit-chain-of-hash.md`) — verifier used in scenarios #1 and #2
- **HRD-MVP-02** — backup & PITR drill — provides the restore artifacts and commands invoked by §3.3
- **HRD-MVP-06** — SLO definitions — provides the detection signals (Prometheus alert rules) referenced in §3.1, §4.1, §5.1, §6.1
- **CLAUDE.md** — full stack (Supabase / Railway / Upstash / pgBackRest) — recovery commands target these components
- **`.planning/drills/tabletop-2026.md`** — first scheduled tabletop (scenario #1)
