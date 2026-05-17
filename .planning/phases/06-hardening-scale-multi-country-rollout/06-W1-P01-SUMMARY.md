---
phase: 06-hardening-scale-multi-country-rollout
plan: W1-P01
subsystem: security
tags: [secrets-rotation, runbook, keycloak, jwt, brevo, twilio, supabase, aws-s3, ohada-audit]

# Dependency graph
requires:
  - phase: P0 audit / working-tree security fixes
    provides: ".env.example sanitization (P0-1) + scripts/rotation-and-purge/ROTATION-CHECKLIST.md + purge-secrets-from-history.sh (P0-2)"
provides:
  - "Canonical secrets rotation runbook covering all 6 secret families in apps/api/.env.example"
  - "Per-year rotation audit log shell at .planning/drills/rotations-2026.md"
  - "Cross-link from .env.example to runbook for surface discoverability"
affects: [06-W1 hardening waves, audit/compliance reporting, first-customer-cutover runbook (06-W3-P01), pen-test acceptance criteria]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Runbook-per-domain in .planning/runbooks/ (canonical, single source of truth)"
    - "Per-year ops log shell in .planning/drills/{topic}-{YYYY}.md (same convention as backup drills)"
    - "Reference (not duplicate) existing scripts/checklists for domain-specific procedures (D-13)"

key-files:
  created:
    - ".planning/runbooks/secrets-rotation.md"
    - ".planning/drills/rotations-2026.md"
    - ".planning/phases/06-hardening-scale-multi-country-rollout/06-W1-P01-PLAN.md (restored from git eaab8c1)"
  modified:
    - "apps/api/.env.example (additive ROTATION header block, no value changes)"

key-decisions:
  - "Folded P0-1 and P0-2 by reference per D-13 — runbook links to scripts/rotation-and-purge/ROTATION-CHECKLIST.md for Supabase DB rotation and to purge-secrets-from-history.sh for history purge, without duplicating either"
  - "JWT dual-key rotation flagged TECH-DEBT-001 — the runbook documents the procedure but the JwtAuthGuard's dual-key support must be verified before the first 365d rotation comes due"
  - "Rotations log uses the same per-year markdown table shell as the backup drill log (D-07 convention) so a single auditor mental model covers both operational artifacts"

patterns-established:
  - ".planning/runbooks/ for canonical operational runbooks (single source of truth, quarterly review)"
  - ".planning/drills/{topic}-{YYYY}.md per-year append-only logs for audit-trail-worthy ops events"
  - "ROTATE → PURGE order callout — copied verbatim from existing checklist into the runbook to avoid drift"

requirements-completed: [HRD-MVP-04]

# Metrics
duration: 13 min
completed: 2026-05-17
---

# Phase 6 Plan W1-P01: Secrets Rotation Runbook Summary

**Canonical secrets rotation runbook covering Keycloak admin (90d), JWT signing key (365d dual-key), Brevo (180d), Twilio (180d), Supabase DB (90d), AWS S3 (180d) — each procedure linked to the existing P0-1/P0-2 artifacts rather than duplicated.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-05-17T19:43:00Z
- **Completed:** 2026-05-17T19:56:47Z
- **Tasks:** 2
- **Files created:** 3 (runbook, rotations log shell, restored plan file)
- **Files modified:** 1 (apps/api/.env.example — additive header only)

## Accomplishments

- `.planning/runbooks/secrets-rotation.md` — full per-secret procedures (cadence, prerequisites, steps, verification, rollback) for all 6 secret families in `apps/api/.env.example`, with cadence matrix matching D-12 verbatim and JWT dual-key window documented per D-12
- `.planning/drills/rotations-2026.md` — per-year audit log shell following the backup-drill convention (D-07)
- `apps/api/.env.example` — additive ROTATION header pointing operators to the runbook on first read
- Folded P0-1 (env sanitization) and P0-2 (history purge script) by **reference** per D-13 — no duplication
- HRD-MVP-04 satisfied: an on-call engineer paged at 3am has one document with cadence, ordered steps, verification commands, and rollback for every production secret

## Task Commits

Each task was committed atomically:

1. **Task 1: Write canonical Secrets Rotation Runbook covering all 6 secret families** — `bdb284b` (docs)
2. **Task 2: Cross-link .env.example to runbook + create rotations log shell** — `a01e2df` (docs)

_Note: Task 1 also restored `06-W1-P01-PLAN.md` from commit `eaab8c1` — it had been committed but was missing from the working tree on agent spawn (see Deviations below)._

## Files Created/Modified

- `.planning/runbooks/secrets-rotation.md` — canonical rotation runbook (7 sections: Purpose, Cadence Matrix, ORDER MATTERS, Per-secret procedures ×6, Post-rotation purge, Audit log, References)
- `.planning/drills/rotations-2026.md` — per-year rotation event log table shell
- `.planning/phases/06-hardening-scale-multi-country-rollout/06-W1-P01-PLAN.md` — restored from git history (eaab8c1) since the file was missing on disk despite being committed
- `apps/api/.env.example` — added 6-line `─── ROTATION ───` comment block at the top (between existing P0-1 security header and `NODE_ENV=development`). Additive only — `git diff` confirms no value or variable was renamed/deleted.

## Decisions Made

- **D-13 compliance via reference, not copy** — Supabase DB password rotation (section 4.5) explicitly defers steps to `scripts/rotation-and-purge/ROTATION-CHECKLIST.md` Steps 2–4. History purge (section 5) defers to `purge-secrets-from-history.sh`. This keeps `scripts/rotation-and-purge/` as the single source of truth for already-shipped procedures and prevents drift when those scripts are updated.
- **JWT dual-key flagged as TECH-DEBT-001 inline in the runbook** — rather than blocking on `JwtAuthGuard` implementation now (out of scope for this plan), the runbook documents the procedure AND warns the operator to verify dual-key support exists in `apps/api/src/auth/jwt-auth.guard.ts` before executing. First 365d rotation isn't due for a year, so the tech debt has time to be addressed.
- **Per-year rotations log** matches the `.planning/drills/backup-YYYYMM.md` convention from D-07 — auditors see the same shape for backup drills and rotation events.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Restored missing 06-W1-P01-PLAN.md from git history**
- **Found during:** Initial plan load (before Task 1 could start)
- **Issue:** The plan file `.planning/phases/06-hardening-scale-multi-country-rollout/06-W1-P01-PLAN.md` was committed in `eaab8c1` ("docs(06): plans for Section 6A v1.1-MVP hardening") but was missing from the working tree on agent spawn. Without the plan file, Task 1 and Task 2 actions could not be read.
- **Fix:** `git show eaab8c1:.planning/phases/06-hardening-scale-multi-country-rollout/06-W1-P01-PLAN.md > .planning/phases/.../06-W1-P01-PLAN.md`
- **Files modified:** restored `.planning/phases/06-hardening-scale-multi-country-rollout/06-W1-P01-PLAN.md`
- **Verification:** file present, Read tool returns full 206-line plan content matching the original commit
- **Committed in:** `bdb284b` (folded into Task 1 commit)

**2. [Rule 1 — Bug] First .env.example Edit landed in a stale path**
- **Found during:** Task 2 (verification step)
- **Issue:** First Edit invocation targeted the file via a path outside the worktree (the OneDrive root copy), so the verification `grep` against the worktree-relative path `apps/api/.env.example` failed.
- **Fix:** Re-read the file via the worktree-absolute path, then re-ran Edit with the same patch on the worktree-absolute path. `git diff` confirms additive-only.
- **Files modified:** `apps/api/.env.example` (worktree-absolute path)
- **Verification:** `grep -q "secrets-rotation.md" apps/api/.env.example` returns 0; `git diff` shows only the 6-line additive block.
- **Committed in:** `a01e2df` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking restore, 1 bug-fix retry)
**Impact on plan:** Both deviations were mechanical (file-restoration + path correction). No scope creep, no semantic changes to the planned artifacts.

## Issues Encountered

- The W1-P01 plan was committed in `eaab8c1` but the file was absent from the working tree. Likely a previous local cleanup / checkout race. Restoring from git history was clean. Other W1 plans (P02/P03/P04/P05) may have the same condition for the parallel agents — they can apply the same `git show <hash>:<path>` recovery.

## User Setup Required

None — runbook references existing credentials/dashboards that the SRE on-call already owns. No new external service configuration was introduced by this plan.

## Known Stubs

None. The runbook is operationally complete. The one referenced future verification (`scripts/test-brevo.ts`, `scripts/test-twilio.ts`, `scripts/test-s3-upload.ts`) are conventional verification scripts that may or may not exist yet — the runbook surfaces this so an operator knows what to write if missing. This is not a stub in the rendering-empty-data sense; it is an operational dependency surfaced for the on-call engineer.

## Self-Check: PASSED

- `.planning/runbooks/secrets-rotation.md` — FOUND
- `.planning/drills/rotations-2026.md` — FOUND
- `.planning/phases/06-hardening-scale-multi-country-rollout/06-W1-P01-PLAN.md` — FOUND
- `apps/api/.env.example` ROTATION header — FOUND (grep -q secrets-rotation.md returns 0)
- Commit `bdb284b` (Task 1) — FOUND in git log
- Commit `a01e2df` (Task 2) — FOUND in git log

## Next Phase Readiness

- W1-P01 (HRD-MVP-04) closed; W1-P02..W1-P05 are executing in parallel and consume no artifact of this plan
- W3-P01 (production cutover runbook) will reference `.planning/runbooks/secrets-rotation.md` in its pre-flight checklist
- Tech debt to track: `TECH-DEBT-001` — verify/implement JwtAuthGuard dual-key support before the first 365d JWT rotation (due ~2027-05)

---
*Phase: 06-hardening-scale-multi-country-rollout*
*Completed: 2026-05-17*
