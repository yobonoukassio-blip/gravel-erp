# Pen-Test Drill Schedule (non-blocking parallel track)

## Purpose
Track scheduled adversarial test sessions as a NON-BLOCKING parallel track per
user memory `feedback_human_prereqs_non_blocking`. Phase 6 ships the procedure
runbook + automation scripts + run templates; the actual sessions run on the
team's own cadence and DO NOT block phase completion.

If a session uncovers a CRITICAL finding, that re-opens HRD-MVP-01 via
gap-closure mode — but only AFTER the session has actually happened.

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
v1.1 cutover should NOT proceed until the 2026-Q2 session completes with the
acceptance gate signed off in REMEDIATION.md. This is a soft gate enforced by
the cutover runbook (HRD-MVP-08), NOT a phase-completion blocker.

## References
- HRD-MVP-01 (`.planning/REQUIREMENTS.md`)
- D-01..D-04 in `.planning/phases/06-hardening-scale-multi-country-rollout/06-CONTEXT.md`
- User memory `feedback_human_prereqs_non_blocking`
