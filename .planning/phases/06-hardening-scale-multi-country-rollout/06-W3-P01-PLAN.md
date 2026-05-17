---
phase: 06-hardening-scale-multi-country-rollout
plan: W3-P01
type: execute
wave: 3
depends_on: [W1-P01, W1-P02, W1-P03, W1-P04, W1-P05, W2-P01, W2-P03]
files_modified:
  - .planning/runbooks/pen-test-procedure.md
  - .planning/pen-tests/2026-Q2-internal-red-team/SCOPE.md
  - .planning/pen-tests/2026-Q2-internal-red-team/FINDINGS.md
  - .planning/pen-tests/2026-Q2-internal-red-team/REMEDIATION.md
  - .planning/drills/pen-test-schedule.md
  - scripts/security/staging-seed-synthetic.sh
  - scripts/security/zap-baseline.sh
autonomous: true
requirements: [HRD-MVP-01]
requirements_covered: [HRD-MVP-01]
must_haves:
  truths:
    - "Pen-test scope is OWASP Top 10 + application-layer + API auth/RBAC bypass attempts ONLY (D-01); infrastructure pen-test deferred to v2."
    - "Pen-test target is staging seeded with synthetic data from `db:seed:demo` (D-02 + CONTEXT specifics: NO production data ever touches staging)."
    - "First pass = internal red-team (any team member adversarial against another's module) per D-03."
    - "Acceptance: zero CRITICAL findings, all HIGH findings have remediation tickets, MEDIUM/LOW logged in tech-debt backlog (D-04)."
    - "Procedure runnable using FOSS only (OWASP ZAP or Caido) per 'Claude's Discretion' + feedback_free_tools_only."
    - "Pen-test runs after W1+W2 land — system is hardened before being attacked."
    - "HRD-MVP-01 acceptance is the SHIPPED ARTIFACTS (procedure, ZAP scripts, SCOPE/FINDINGS/REMEDIATION templates). The actual red-team session is tracked as a non-blocking line item in `.planning/drills/pen-test-schedule.md` per `feedback_human_prereqs_non_blocking`."
  artifacts:
    - path: ".planning/runbooks/pen-test-procedure.md"
      provides: "Repeatable pen-test procedure (scope, prep, execution, reporting, acceptance)"
      contains_all:
        - "OWASP Top 10"
        - "internal red-team"
        - "zero CRITICAL"
        - "staging"
        - "ZAP"
    - path: ".planning/pen-tests/2026-Q2-internal-red-team/SCOPE.md"
      provides: "Per-run scope document (modules in / out, attack surfaces, time-box)"
    - path: ".planning/pen-tests/2026-Q2-internal-red-team/FINDINGS.md"
      provides: "Findings template — populated during the run"
    - path: ".planning/pen-tests/2026-Q2-internal-red-team/REMEDIATION.md"
      provides: "Remediation tracker (one row per HIGH/CRITICAL finding)"
    - path: ".planning/drills/pen-test-schedule.md"
      provides: "Non-blocking schedule/TODO entry for the 2026-Q2 red-team session — tracked as parallel track, not a phase blocker"
      contains: "2026-Q2-internal-red-team"
    - path: "scripts/security/staging-seed-synthetic.sh"
      provides: "Seed staging with synthetic data via db:seed:demo (NO prod data)"
    - path: "scripts/security/zap-baseline.sh"
      provides: "Automated OWASP ZAP baseline scan against staging"
  key_links:
    - from: ".planning/runbooks/pen-test-procedure.md"
      to: ".planning/pen-tests/2026-Q2-internal-red-team/SCOPE.md"
      via: "Procedure §4 instructs running scope template per run"
      pattern: "pen-tests/.*SCOPE"
    - from: "scripts/security/staging-seed-synthetic.sh"
      to: "package.json db:seed:demo script"
      via: "shell script invokes the seed command"
      pattern: "db:seed:demo|seed-demo"
    - from: ".planning/drills/pen-test-schedule.md"
      to: ".planning/runbooks/pen-test-procedure.md"
      via: "Schedule entry links to procedure runbook"
      pattern: "pen-test-procedure"
---

<objective>
Ship HRD-MVP-01 acceptance artifacts — pen-test procedure runbook, supporting automation (ZAP baseline + synthetic seed scripts), and the 2026-Q2 internal red-team run skeleton (SCOPE/FINDINGS/REMEDIATION). Per D-01/02/03/04 the scope is OWASP Top 10 + app-layer + API auth/RBAC bypass; target is staging seeded with synthetic data; executors are internal red-team; acceptance is zero CRITICAL, all HIGH ticketed.

**Phase-blocker boundary (per user memory `feedback_human_prereqs_non_blocking`):**
- The PHASE-BLOCKING deliverable is the artifact set — procedure + scripts + SCOPE/FINDINGS/REMEDIATION templates. Shipped → REQ HRD-MVP-01 marked satisfied.
- The actual red-team SESSION (humans pairing up to attack each other's modules) is tracked as a NON-BLOCKING parallel track entry in `.planning/drills/pen-test-schedule.md`. It is intentionally NOT a `checkpoint:human-action` (ateliers et revues humaines = pistes parallèles).
- A CRITICAL finding from the eventual session re-opens the phase via gap-closure mode; it does NOT prevent phase completion today.

Purpose: All prior W1+W2 tracks harden the system; this track *prepares* the adversarial test artifact set so any pair on the team can execute the procedure on their own cadence. Per CONTEXT.md "no business driver" for third-party pen-test yet — internal red-team is cheap, finds 80% of issues, and produces the artifact (FINDINGS + REMEDIATION) that goes into the customer compliance pack.

Output: pen-test procedure runbook + first run's scope/findings/remediation triplet under `.planning/pen-tests/2026-Q2-internal-red-team/` + 2 supporting scripts (synthetic seed + ZAP baseline) + non-blocking drill schedule entry.
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
@docs/adr/ADR-0008-hse-incident-immutability-capa.md
@docs/adr/ADR-0009-weighing-ticket-offline-numbering.md
@.planning/runbooks/secrets-rotation.md
@.planning/runbooks/disaster-recovery.md
@.planning/runbooks/slo-definitions.md
@CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Author pen-test-procedure.md + create 2 supporting scripts</name>
  <files>.planning/runbooks/pen-test-procedure.md, scripts/security/staging-seed-synthetic.sh, scripts/security/zap-baseline.sh</files>
  <read_first>
    - .planning/phases/06-hardening-scale-multi-country-rollout/06-CONTEXT.md (D-01, D-02, D-03, D-04, "Claude's Discretion" tooling)
    - docs/adr/ADR-0001-rls-multi-tenancy.md (the 3-layer defense the pen-test targets)
    - docs/adr/ADR-0004-audit-chain-of-hash.md (chain manipulation attack surface)
    - docs/adr/ADR-0008-hse-incident-immutability-capa.md (mutate-incident attack target)
    - docs/adr/ADR-0009-weighing-ticket-offline-numbering.md (race condition / collision target)
  </read_first>
  <action>

### 1. `.planning/runbooks/pen-test-procedure.md`

```
# Pen-Test Procedure (HRD-MVP-01)

## 1. Scope (D-01 — v1.1)
**IN scope:**
- OWASP Top 10 (2021) — full sweep against staging
- Application-layer attacks: authentication, authorization, input validation, business logic
- API: auth bypass, RBAC bypass, IDOR, mass assignment, rate-limit evasion
- Multi-tenant: RLS leak attempts (ADR-0001 3-layer defense), cross-tenant data exposure
- Audit chain manipulation (ADR-0004)
- HSE incident mutation attempts (ADR-0008)
- Offline weighing-ticket collision / race (ADR-0009)
- JWT → CLS → GUC middleware bypass attempts

**OUT of scope (v2):**
- AWS / network / Kubernetes infrastructure
- Physical security
- Social engineering
- Third-party services (Brevo, Twilio, Supabase platform — their responsibility)
- DDoS / volumetric attacks
- Production environment (only staging — see D-02)

## 2. Tooling (FOSS only per feedback_free_tools_only)
- **OWASP ZAP** (baseline + active scans) — primary
- **Caido Community** — manual testing, request crafting
- **sqlmap** — for any endpoint suspected of injection
- **JWT tool / jwt.io** — token forgery attempts (must use OFFLINE for staging tokens; never submit prod tokens to web tools)
- **Postman / Insomnia** — orchestrated RBAC bypass scenarios
- **psql** + service_role key (staging only!) — verify RLS by direct DB read attempts

## 3. Target (D-02)
- **Environment:** staging only
- **Data:** synthetic, generated via `bash scripts/security/staging-seed-synthetic.sh` (calls existing `db:seed:demo`)
- **CRITICAL:** No production data ever touches staging — RLS leak risk during testing would itself be a P0 incident. Verify staging DB connection string before each run.

## 4. Procedure (one run, 2-3 day time-box)

### Phase A — Preparation (Day -1)
1. Copy `.planning/pen-tests/{YYYY-Q{n}}-internal-red-team/SCOPE.md.template` to `.planning/pen-tests/{YYYY-Q{n}}-internal-red-team/SCOPE.md`
2. Fill in: dates, participants, in-scope module list, out-of-scope items
3. Seed staging: `bash scripts/security/staging-seed-synthetic.sh`
4. Run baseline ZAP scan: `bash scripts/security/zap-baseline.sh https://staging-gravel.vercel.app`
5. Triage automated findings into FINDINGS.md (template provided)

### Phase B — Internal Red-Team (Day 0-1, D-03)
Pair adversarially: each team member attacks a module they did NOT build. Examples:
- The author of the Finance module attacks the Audit module
- The author of the Sync module attacks the RLS middleware
- The author of the Notification module attacks the HSE immutability

Documented attack scenarios (minimum coverage):
1. **RLS leak** — log in as tenant A, attempt to query tenant B data via SQL injection vector, parameter tampering on tenant_id query param, GraphQL/REST injection
2. **JWT forgery** — strip alg, use 'none' alg, swap kid, replay expired token, replay revoked token
3. **RBAC bypass** — OPERATEUR attempts COMPLIANCE_OFFICER endpoints; site-A user attempts site-B mutation
4. **Audit chain tamper** — DB-level row UPDATE attempts (RLS-bypassed via service_role on staging only) to verify verifier catches break
5. **HSE incident mutation** — attempt UPDATE on incident after closure (ADR-0008 immutability)
6. **Weighing ticket collision** — submit identical offline-numbered tickets from 2 clients simultaneously (ADR-0009)
7. **Mass assignment** — POST extra fields (createdAt, tenantId, role) to see if they overwrite server state
8. **Rate-limit bypass** — distribute requests across IPs / change User-Agent / use HTTP/2 multiplexing

### Phase C — Reporting (Day 2)
- Severity scoring per common code-review levels:

  | Level | Action |
  |-------|--------|
  | CRITICAL | BLOCK ship — must fix before v1.1 cutover |
  | HIGH | Remediation ticket required |
  | MEDIUM | Tech-debt backlog |
  | LOW | Tech-debt backlog (optional) |

- Populate FINDINGS.md with one entry per issue
- Populate REMEDIATION.md with one row per HIGH/CRITICAL with owner + due date

### Phase D — Acceptance Gate (D-04)
- **Zero CRITICAL findings** → required to proceed with v1.1 cutover (HRD-MVP-08)
- **All HIGH have remediation tickets** → required
- **MEDIUM/LOW logged** → required (no silent omissions)

If CRITICAL exists: FIX → re-test affected module → re-run acceptance gate.

## 5. Cadence
- Per major release minimum (so: each milestone v{n}.0 launch)
- Plus on-demand after any auth / RLS / audit code change

## 6. v2 future expansion
- Third-party pen-test (paid firm) → v2 milestone budget
- Infrastructure pen-test (AWS / K8s) → v2 milestone
- Continuous DAST in CI → consider once v1.1 stable

## 7. References
- D-01, D-02, D-03, D-04 in `.planning/phases/06-hardening-scale-multi-country-rollout/06-CONTEXT.md`
- ADR-0001 (RLS), ADR-0004 (audit chain), ADR-0008 (HSE), ADR-0009 (weighing ticket)
- HRD-MVP-08 cutover (this is a T-7d pre-flight item)
```

### 2. `scripts/security/staging-seed-synthetic.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

# scripts/security/staging-seed-synthetic.sh
# Seed staging with SYNTHETIC data only — never copy production.
# Per HRD-MVP-01 D-02 + CONTEXT specifics.

if [[ -z "${STAGING_DATABASE_URL:-}" ]]; then
  echo "ERROR: STAGING_DATABASE_URL must be set" >&2
  exit 2
fi

# Sanity guard: ensure we are NOT pointed at prod
if [[ "${STAGING_DATABASE_URL}" == *"-prod"* ]] || [[ "${STAGING_DATABASE_URL}" == *"production"* ]]; then
  echo "ABORT: STAGING_DATABASE_URL appears to point at production — refusing to seed" >&2
  exit 3
fi

echo "[seed] Running db:seed:demo against staging…"
DATABASE_URL="${STAGING_DATABASE_URL}" pnpm --filter api db:seed:demo

echo "[seed] Done. Staging seeded with synthetic tenants, sites, users, equipment."
echo "[seed] Verify: psql \"${STAGING_DATABASE_URL}\" -c \"SELECT count(*) FROM tenant;\""
```

### 3. `scripts/security/zap-baseline.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

# scripts/security/zap-baseline.sh
# Run OWASP ZAP baseline scan against a staging URL.
# Usage: bash scripts/security/zap-baseline.sh https://staging-gravel.vercel.app

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  echo "Usage: $0 <staging-url>" >&2
  exit 2
fi
if [[ "$TARGET" == *"prod"* ]] || [[ "$TARGET" == *"production"* ]]; then
  echo "ABORT: target URL appears to be production" >&2
  exit 3
fi

OUTDIR="${ZAP_OUT:-./zap-report}"
mkdir -p "$OUTDIR"

echo "[zap] Running baseline scan against $TARGET — output: $OUTDIR"

docker run --rm -v "$(pwd)/${OUTDIR}:/zap/wrk:rw" \
  ghcr.io/zaproxy/zaproxy:stable zap-baseline.py \
  -t "$TARGET" \
  -r baseline-report.html \
  -J baseline-report.json \
  -I  # do not fail on warnings; let humans triage

echo "[zap] Report: ${OUTDIR}/baseline-report.html"
echo "[zap] JSON:   ${OUTDIR}/baseline-report.json"
echo "[zap] Next: triage findings into .planning/pen-tests/{YYYY-Qn}-internal-red-team/FINDINGS.md"
```
  </action>
  <verify>
    <automated>test -f .planning/runbooks/pen-test-procedure.md && grep -q "OWASP Top 10" .planning/runbooks/pen-test-procedure.md && grep -q "internal red-team" .planning/runbooks/pen-test-procedure.md && grep -q "zero CRITICAL" .planning/runbooks/pen-test-procedure.md && grep -q "staging" .planning/runbooks/pen-test-procedure.md && grep -q "ZAP" .planning/runbooks/pen-test-procedure.md && test -f scripts/security/staging-seed-synthetic.sh && test -f scripts/security/zap-baseline.sh && bash -n scripts/security/staging-seed-synthetic.sh && bash -n scripts/security/zap-baseline.sh</automated>
  </verify>
  <acceptance_criteria>
    - Procedure runbook covers D-01/02/03/04 explicitly
    - OWASP Top 10, internal red-team, zero CRITICAL, staging, ZAP terms all present
    - Both shell scripts pass `bash -n` syntax check
    - Synthetic seed script has guard against pointing at production
    - ZAP script has guard against pointing at production
  </acceptance_criteria>
  <done>The procedure is repeatable: anyone on the team can pick up the runbook, run the 2 scripts, and execute a pen-test pass without further onboarding.</done>
</task>

<task type="auto">
  <name>Task 2: Bootstrap first pen-test run artifacts (2026-Q2 internal red-team)</name>
  <files>.planning/pen-tests/2026-Q2-internal-red-team/SCOPE.md, .planning/pen-tests/2026-Q2-internal-red-team/FINDINGS.md, .planning/pen-tests/2026-Q2-internal-red-team/REMEDIATION.md</files>
  <read_first>
    - .planning/runbooks/pen-test-procedure.md (just-created — Task 1)
    - .planning/phases/06-hardening-scale-multi-country-rollout/06-CONTEXT.md (D-01..04)
  </read_first>
  <action>

### 1. `.planning/pen-tests/2026-Q2-internal-red-team/SCOPE.md`

```
# Pen-Test Scope — 2026-Q2 Internal Red-Team

## Metadata
- **Run ID:** 2026-Q2-internal-red-team
- **Window:** 2026-05-26 → 2026-05-28 (3-day time-box; align to v1.1 cutover T-7d)
- **Target:** https://{staging-url} (env var STAGING_URL during run)
- **Lead:** {tech lead} (non-rotating)
- **Participants:** all engineering team

## Pairing matrix (per D-03 — each attacks a module they did NOT build)
| Attacker | Target module | Author of target |
|----------|---------------|------------------|
| {name1}  | Audit module + chain export (W1-P05) | {name2} |
| {name2}  | RLS middleware + JWT→CLS→GUC | {name1} |
| {name3}  | HSE incident immutability | {name4} |
| {name4}  | Weighing-ticket offline numbering | {name3} |
| {name5}  | Sync deadletter replay (W2-P03) | {name1} |

(Fill names from current team roster on Day -1.)

## In-scope modules
- Auth (JWT validation, refresh, RBAC guards)
- All API endpoints under `/api/*`
- RLS + TenantAwareRepository
- Audit chain (verifier + export endpoint)
- HSE incident lifecycle (immutability post-closure)
- Sync ingress + deadletter replay
- Notification dispatch (BullMQ enqueue endpoints)

## Out-of-scope
- AWS infrastructure
- Supabase platform (their pen-test)
- Brevo / Twilio (their responsibility)
- Production environment (D-02)
- Physical / social engineering

## Attack scenario coverage (minimum)
Per procedure §4 Phase B — 8 scenarios. Mark each at end-of-run as TESTED / NOT-TESTED.

| # | Scenario | Owner | Status |
|---|----------|-------|--------|
| 1 | RLS leak | — | NOT-TESTED |
| 2 | JWT forgery | — | NOT-TESTED |
| 3 | RBAC bypass | — | NOT-TESTED |
| 4 | Audit chain tamper | — | NOT-TESTED |
| 5 | HSE incident mutation | — | NOT-TESTED |
| 6 | Weighing ticket collision | — | NOT-TESTED |
| 7 | Mass assignment | — | NOT-TESTED |
| 8 | Rate-limit bypass | — | NOT-TESTED |

## Acceptance gate (D-04)
- Zero CRITICAL → required for v1.1 cutover sign-off
- All HIGH ticketed in REMEDIATION.md
- MEDIUM/LOW in this repo's tech-debt section of ROADMAP.md

## Sign-off
- [ ] Tech lead
- [ ] Customer Success lead (informed only)
```

### 2. `.planning/pen-tests/2026-Q2-internal-red-team/FINDINGS.md`

```
# Pen-Test Findings — 2026-Q2 Internal Red-Team

Populate one entry per finding during Phase B. Severity per procedure §4 Phase C.

***

## Finding template (copy per finding)

### F-{NN} — {Short title}
- **Severity:** CRITICAL | HIGH | MEDIUM | LOW
- **Scenario:** {1-8 from SCOPE.md coverage table}
- **Discovered by:** {name}
- **Discovered on:** {date}
- **Target endpoint / module:** {e.g., POST /api/audit/export}
- **Description:**
  {What was attempted, what happened, what should have happened}
- **Reproducer:**
  ```
  {curl / sqlmap / ZAP step that reproduces}
  ```
- **Impact:**
  {Data exposure? Privilege escalation? Service degradation?}
- **CVSS (if applicable):** {score + vector}
- **Status:** OPEN | FIXED | WONT-FIX
- **Remediation ticket:** {link in REMEDIATION.md or external}

***

## Findings (populate during run)

_(none yet — populated Day 0-1)_

***

## ZAP baseline output
Attach `zap-report/baseline-report.html` from `scripts/security/zap-baseline.sh` run.
Triage automated findings here, ignoring known-false-positives (document the exclusion rationale).
```

### 3. `.planning/pen-tests/2026-Q2-internal-red-team/REMEDIATION.md`

```
# Pen-Test Remediation Tracker — 2026-Q2 Internal Red-Team

One row per HIGH or CRITICAL finding. MEDIUM/LOW go to ROADMAP.md tech-debt section.

| F-ID  | Severity | Title | Owner | Due date | Status | PR/commit |
|-------|----------|-------|-------|----------|--------|-----------|
| _ex_  | _HIGH_   | _Example finding_ | _{name}_ | _2026-06-15_ | _IN-PROGRESS_ | _#1234_ |

## Acceptance gate evaluation
- Zero CRITICAL? **[ ] Yes / [ ] No**
- All HIGH have a row above? **[ ] Yes / [ ] No**
- MEDIUM/LOW logged in `.planning/ROADMAP.md` tech-debt table? **[ ] Yes / [ ] No**

If all three are Yes → sign off below; HRD-MVP-01 satisfied; v1.1 cutover may proceed (HRD-MVP-08).

## Sign-off
- [ ] Tech lead — {name} — {date}
- [ ] Pen-test lead — {name} — {date}
```
  </action>
  <verify>
    <automated>test -f .planning/pen-tests/2026-Q2-internal-red-team/SCOPE.md && test -f .planning/pen-tests/2026-Q2-internal-red-team/FINDINGS.md && test -f .planning/pen-tests/2026-Q2-internal-red-team/REMEDIATION.md && grep -q "RLS leak" .planning/pen-tests/2026-Q2-internal-red-team/SCOPE.md && grep -q "JWT forgery" .planning/pen-tests/2026-Q2-internal-red-team/SCOPE.md && grep -q "Zero CRITICAL" .planning/pen-tests/2026-Q2-internal-red-team/REMEDIATION.md</automated>
  </verify>
  <acceptance_criteria>
    - All 3 files exist
    - SCOPE.md has 8-scenario coverage table + pairing matrix template
    - FINDINGS.md has finding-template structure
    - REMEDIATION.md has acceptance-gate checklist (D-04)
  </acceptance_criteria>
  <done>The 2026-Q2 pen-test run is bootstrapped — only the in-flight "fill team names + execute scenarios" remains for a human session.</done>
</task>

<task type="auto">
  <name>Task 3: Schedule the red-team session as a NON-BLOCKING parallel track (advisory documentation)</name>
  <files>.planning/drills/pen-test-schedule.md</files>
  <read_first>
    - .planning/runbooks/pen-test-procedure.md (just-created — Task 1)
    - .planning/pen-tests/2026-Q2-internal-red-team/ (just-created — Task 2 artifacts)
    - User memory `feedback_human_prereqs_non_blocking` — ateliers et revues humaines = pistes parallèles, JAMAIS checkpoint:human-action
  </read_first>
  <action>
Per user memory `feedback_human_prereqs_non_blocking`, the pen-test SESSION itself must NOT be a `checkpoint:human-action` — it is tracked as a parallel-track schedule item that does not block phase completion.

Create `.planning/drills/pen-test-schedule.md` (create the `drills/` directory if needed):

```
# Pen-Test Drill Schedule (non-blocking parallel track)

## Purpose
Track scheduled adversarial test sessions as a NON-BLOCKING parallel track per user memory `feedback_human_prereqs_non_blocking`. Phase 6 ships the procedure runbook + automation scripts + run templates; the actual sessions run on the team's own cadence and DO NOT block phase completion.

If a session uncovers a CRITICAL finding, that re-opens HRD-MVP-01 via gap-closure mode — but only AFTER the session has actually happened.

## Scheduled sessions

| Session ID | Type | Owner | Target window | Status | Outputs |
|------------|------|-------|---------------|--------|---------|
| 2026-Q2-internal-red-team | Internal red-team | {tech lead} | 2026-05-26 → 2026-05-28 (T-7d before v1.1 cutover) | TO-SCHEDULE | `.planning/pen-tests/2026-Q2-internal-red-team/` (SCOPE, FINDINGS, REMEDIATION) |
| 2026-Q3-internal-red-team | Internal red-team | TBD | 2026-08 | NOT-PLANNED | — |
| 2026-Q4-external-pen-test | Third-party (paid) | DEFERRED | v2 milestone | DEFERRED-V2 | — |

## Procedure reference
- Runbook: `.planning/runbooks/pen-test-procedure.md`
- Automation: `scripts/security/staging-seed-synthetic.sh`, `scripts/security/zap-baseline.sh`

## How to schedule a session
1. Pick a target window (typically T-7d before a customer-visible release)
2. Update the row above (status: TO-SCHEDULE → SCHEDULED → IN-PROGRESS → COMPLETE)
3. Fill names in the SCOPE.md pairing matrix
4. Execute per procedure §4 Phases A→D
5. On COMPLETE: link the FINDINGS.md commit hash above
6. If CRITICAL found: open a gap-closure planning request via `/gsd:plan-phase --gaps`

## v1.1 cutover gate (HRD-MVP-08)
v1.1 cutover should NOT proceed until the 2026-Q2 session completes with the acceptance gate signed off in REMEDIATION.md. This is a soft gate enforced by the cutover runbook (HRD-MVP-08), NOT a phase-completion blocker.

## References
- HRD-MVP-01 (`.planning/REQUIREMENTS.md`)
- D-01..D-04 in `.planning/phases/06-hardening-scale-multi-country-rollout/06-CONTEXT.md`
- User memory `feedback_human_prereqs_non_blocking`
```
  </action>
  <verify>
    <automated>test -f .planning/drills/pen-test-schedule.md && grep -q "2026-Q2-internal-red-team" .planning/drills/pen-test-schedule.md && grep -q "non-blocking" .planning/drills/pen-test-schedule.md && grep -q "pen-test-procedure" .planning/drills/pen-test-schedule.md</automated>
  </verify>
  <acceptance_criteria>
    - `.planning/drills/pen-test-schedule.md` exists
    - Lists 2026-Q2-internal-red-team with status TO-SCHEDULE
    - Explicitly labels itself as non-blocking parallel track
    - Cross-references the procedure runbook + automation scripts
  </acceptance_criteria>
  <done>The team has a tracking document for adversarial sessions; the phase is unblocked because the SHIPPED artifacts (procedure + templates + automation) are the acceptance criteria, not the session itself.</done>
</task>

</tasks>

<verification>
- Pen-test procedure runbook + 2 scripts + first-run artifact triplet + drill-schedule entry all committed.
- HRD-MVP-01 acceptance = artifact set delivered (NOT a human session). Session is tracked separately as non-blocking work.
- v1.1 cutover (HRD-MVP-08) carries the soft gate of "session completes before customer go-live" — enforced in cutover runbook, not in this plan.
</verification>

<success_criteria>
HRD-MVP-01 satisfied: the procedure, automation, and run-template artifacts are shipped and committed. The 2026-Q2 red-team session is scheduled as a non-blocking parallel track entry in `.planning/drills/pen-test-schedule.md` — when it runs, its CRITICAL/HIGH outcomes feed back via gap-closure mode if needed.
</success_criteria>

<output>
After completion, create `.planning/phases/06-hardening-scale-multi-country-rollout/06-W3-P01-SUMMARY.md`.
</output>
