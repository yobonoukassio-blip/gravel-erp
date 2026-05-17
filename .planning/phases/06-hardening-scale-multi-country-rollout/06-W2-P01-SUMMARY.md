---
phase: 06-hardening-scale-multi-country-rollout
plan: W2-P01
subsystem: infra/disaster-recovery
tags: [backup, pitr, pgbackrest, drill, ci, hrd-mvp-02]
requirements_completed: [HRD-MVP-02]
dependency-graph:
  requires:
    - W1-P04 (slo-definitions runbook — drill timings feed SLO baseline)
  provides:
    - monthly automated backup & PITR drill (.github/workflows/backup-drill.yml)
    - restore-pgbackrest.sh + schema-diff.sh (reusable by HRD-MVP-03 DR runbook scenario #1)
    - committed audit trail at .planning/drills/backup-{YYYYMM}.md
  affects:
    - HRD-MVP-03 §3 (DR runbook reuses the same restore scripts)
    - HRD-MVP-08 cutover pre-flight (T-7d requires a successful drill)
tech-stack:
  added: []
  patterns:
    - "Drill artifacts committed to repo (audit-readable without S3 access) — same pattern as ADRs"
    - "Machine-readable JSON result (/tmp/drill-result.json) for CI assertion + human-readable artifact"
    - "Docker-on-runner scratch Postgres (no separate infrastructure needed for the drill)"
key-files:
  created:
    - .planning/runbooks/backup-restore-drill.md
    - scripts/dr/restore-pgbackrest.sh
    - scripts/dr/schema-diff.sh
    - .github/workflows/backup-drill.yml
    - .planning/drills/backup-202605.md
  modified: []
decisions:
  - "Honored D-05: monthly GH Actions cron `0 2 1 * *`, scratch PG18 via docker, pgBackRest restore to T-1h, schema-diff vs S3 reference dump"
  - "Honored D-06: RTO=3600s and RPO=300s targets stated in runbook AND asserted programmatically in restore-pgbackrest.sh (rto_pass boolean in result JSON)"
  - "Honored D-07: workflow auto-commits .planning/drills/backup-{YYYYMM}.md on every run (including failures, via `if: always()`), so audit history is unbroken"
  - "Chose docker-on-runner over Supabase branch DB for the scratch Postgres — zero new dependencies, isolated per run, easy local repro"
  - "Reference schema dump fetched from `s3://gravel-prod-backups/schema/latest.sql` — assumes deploy pipeline uploads this post-migrate (called out in runbook §3 as a prerequisite to wire separately if not already in place)"
metrics:
  duration_minutes: 3
  tasks_completed: 2
  files_created: 5
  files_modified: 0
  completed_date: 2026-05-17
---

# Phase 6 Plan W2-P01: Backup & PITR Drill (HRD-MVP-02) Summary

Monthly automated GitHub Actions cron that restores production from pgBackRest base + WAL to T-1h on a scratch Postgres 18 (docker), asserts zero schema drift via `pg_dump --schema-only` diff, and commits an audit-trail artifact to `.planning/drills/backup-{YYYYMM}.md`.

## What was built

### Task 1 — Runbook + restore/schema-diff scripts (commit `3ec993f`)

- **`.planning/runbooks/backup-restore-drill.md`** — full operational doc:
  - §1 Purpose & cadence (monthly cron + on-demand + pre-cutover triggers)
  - §2 Targets table — explicit `RTO target = 1 hour`, `RPO target = 5 minutes` (per D-06)
  - §3 Prerequisites (pgBackRest stanza, IAM read-only role, S3 reference dump, runner tooling)
  - §4 Automated procedure (9-step CI flow)
  - §5 Manual procedure (local repro from any laptop with AWS creds)
  - §6 Failure modes & remediation table (restore slow / schema drift / WAL gap / dump missing / docker fail)
  - §7 Audit log table (rows appended per run)
  - §8 References (D-05/06/07, downstream HRD-MVP-03, SLO feed, scripts, workflow)

- **`scripts/dr/restore-pgbackrest.sh`** — POSIX bash, `set -euo pipefail`:
  - Args: `--target-time` (default `1 hour ago` ISO-8601), `--scratch-port` (default 5433)
  - Validates required env (AWS creds, bucket, stanza)
  - Spins `postgres:18` in docker, waits for ready (≤60s)
  - Writes `/tmp/pgbackrest.conf` with read-only S3 repo + scratch pg1-host
  - `pgbackrest restore --type=time --target=...` (PITR)
  - Sanity-checks via `SELECT version()` + table count
  - Emits `/tmp/drill-result.json` with `total_seconds`, `restore_phase_seconds`, `public_table_count`, `rto_target_seconds: 3600`, `rpo_target_seconds: 300`, `rto_pass` boolean
  - Cross-platform `date` fallback (`date -u -v-1H` on BSD/macOS)

- **`scripts/dr/schema-diff.sh`** — POSIX bash:
  - Args: `--scratch-port`, `--reference-dump`
  - `pg_dump --schema-only` of scratch → tmpfile (auto-cleaned via trap)
  - `diff -u` vs reference → wc -l
  - Exit 0 on 0 lines (PASS), exit 1 on drift (FAIL — first 200 diff lines printed), exit 2 on bad args
  - Uses mktemp+trap for clean tmp handling

- Both scripts: `chmod +x` applied, `bash -n` syntax-checked (passed).

### Task 2 — GH Actions workflow + first artifact baseline (commit `3324a7a`)

- **`.github/workflows/backup-drill.yml`** — full monthly drill pipeline:
  - Triggers: `schedule: cron: '0 2 1 * *'` (monthly, 1st @ 02:00 UTC) + `workflow_dispatch` with optional `target_time` input
  - `permissions: contents: write` — required to commit artifact back to repo
  - `timeout-minutes: 90` (RTO 60 + setup/teardown buffer)
  - Env from `secrets.DRILL_AWS_ACCESS_KEY_ID` / `DRILL_AWS_SECRET_ACCESS_KEY` (read-only IAM)
  - Steps: checkout (fetch-depth 0) → install pgbackrest+psql+awscli → fetch `s3://.../schema/latest.sql` → run `restore-pgbackrest.sh` → run `schema-diff.sh` → tear down docker (always) → generate artifact (always, including failure cases) → git commit + push if changed
  - Artifact template captures: run ID, run URL, trigger, drill-result.json (or error stub), schema_diff outcome, RTO/RPO targets, references to runbook + decisions

- **`.planning/drills/backup-202605.md`** — baseline shell so first real cron run produces a clean diff (not a new file from nothing):
  - Status (workflow path, first scheduled run date)
  - Pre-execution checklist (secrets, stanza, reference dump, runbook review, dry-run)
  - Empty Result table (to populate after first run)
  - Notes (first drill = v1.1 cutover pre-flight HRD-MVP-08 §3 T-7d)
  - References (runbook, workflow, scripts, decisions)

## Verification

| Spec | Result |
|------|--------|
| Runbook contains "RTO target = 1 hour", "RPO target = 5 minutes", "pgBackRest", "1 hour ago", "schema-diff" | PASS (grep verified) |
| `scripts/dr/restore-pgbackrest.sh` exists + `bash -n` clean | PASS |
| `scripts/dr/schema-diff.sh` exists + `bash -n` clean | PASS |
| Restore script emits machine-readable JSON | PASS (`/tmp/drill-result.json` block in script) |
| Workflow has `cron:` + invokes both scripts | PASS (grep verified) |
| Workflow commits artifact to `.planning/drills/backup-{YYYYMM}.md` | PASS (final step writes `git commit` + `git push`) |
| `.planning/drills/backup-202605.md` baseline exists with checklist | PASS |
| YAML syntactically valid | SKIPPED — `js-yaml` not available on runner; verify spec allowed `\|\| true` fallback; structure visually conforms to GH Actions schema and was authored by reference to existing `.github/workflows/ci.yml` |

## Deviations from Plan

**None — plan executed exactly as written.**

The one minor adaptation: cross-platform `date` handling in `restore-pgbackrest.sh`
(`date -u -v-1H` BSD fallback alongside the GNU `date -u -d '1 hour ago'`).
Plan stated GNU only — Rule 3 (auto-fix blocking) applied: anyone running the manual
drill from a Mac would have hit a syntax error otherwise. Documented here, not flagged
as a separate deviation since it's a one-line defensive fallback.

## Authentication gates

None encountered — no live AWS credentials needed at plan-execution time; the workflow
and scripts expect secrets to be wired before the first actual drill run (called out
in `.planning/drills/backup-202605.md` pre-execution checklist).

## Known Stubs

- **`s3://gravel-prod-backups/schema/latest.sql`** — the reference dump fetched by
  the workflow is assumed to exist. Plan §3 explicitly calls this out as a
  prerequisite to be wired in `deploy.yml`'s post-migrate step. **Not blocking**
  for the artifact to be useful — the pre-execution checklist in `backup-202605.md`
  forces this to be verified before the first real run.

- **`.planning/drills/backup-202605.md`** Result table fields are empty
  (`—` placeholders) — intentional, populated by the first actual workflow run
  per D-07. This is the "baseline shell" pattern the plan explicitly requested.

Neither stub prevents the plan's HRD-MVP-02 goal: monthly drill is wired, scripts
are runnable, audit trail will populate on first run.

## Commits

- `3ec993f` — feat(06-W2-P01): backup & PITR drill runbook + restore/schema-diff scripts
- `3324a7a` — feat(06-W2-P01): monthly backup-drill GH Actions workflow + 202605 baseline artifact

## Self-Check: PASSED

- File `.planning/runbooks/backup-restore-drill.md` — FOUND
- File `scripts/dr/restore-pgbackrest.sh` — FOUND
- File `scripts/dr/schema-diff.sh` — FOUND
- File `.github/workflows/backup-drill.yml` — FOUND
- File `.planning/drills/backup-202605.md` — FOUND
- Commit `3ec993f` — FOUND
- Commit `3324a7a` — FOUND
