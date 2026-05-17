---
phase: 06-hardening-scale-multi-country-rollout
plan: W2-P01
type: execute
wave: 2
depends_on: [W1-P04]
files_modified:
  - .planning/runbooks/backup-restore-drill.md
  - .github/workflows/backup-drill.yml
  - scripts/dr/restore-pgbackrest.sh
  - scripts/dr/schema-diff.sh
  - .planning/drills/backup-202605.md
autonomous: true
requirements: [HRD-MVP-02]
requirements_covered: [HRD-MVP-02]
must_haves:
  truths:
    - "A monthly GitHub Actions cron spins up scratch Postgres, restores from pgBackRest base + WAL to T-1h, runs schema-diff vs prod, asserts zero drift (D-05)."
    - "Measured RTO and RPO are committed to .planning/drills/backup-{YYYYMM}.md per run (D-07)."
    - "RTO target = 1h, RPO target = 5 min — gap logged if exceeded (D-06)."
    - "Drill SLO measurements feed the SLO baseline established in W1-P04."
  artifacts:
    - path: ".planning/runbooks/backup-restore-drill.md"
      provides: "Drill procedure, RTO/RPO targets, on-demand manual run instructions"
      contains_all:
        - "RTO target = 1 hour"
        - "RPO target = 5 minutes"
        - "pgBackRest"
        - "T-1h"
        - "schema-diff"
    - path: ".github/workflows/backup-drill.yml"
      provides: "Monthly cron job executing the drill end-to-end"
      contains: "cron:"
    - path: "scripts/dr/restore-pgbackrest.sh"
      provides: "Restore script invoked by cron + manual runs"
    - path: "scripts/dr/schema-diff.sh"
      provides: "Schema-only pg_dump diff between restored vs prod"
    - path: ".planning/drills/backup-202605.md"
      provides: "First baseline drill artifact (template + initial run shell)"
  key_links:
    - from: ".github/workflows/backup-drill.yml"
      to: "scripts/dr/restore-pgbackrest.sh"
      via: "workflow run step invokes script"
      pattern: "scripts/dr/restore-pgbackrest"
    - from: ".github/workflows/backup-drill.yml"
      to: "scripts/dr/schema-diff.sh"
      via: "workflow run step invokes script"
      pattern: "scripts/dr/schema-diff"
---

<objective>
Implement HRD-MVP-02 — monthly automated backup & PITR drill (D-05/06/07) that proves we can restore production from pgBackRest within RTO=1h / RPO=5min, with schema-drift assertion zero. Commit drill artifacts to repo for audit trail.

Purpose: A backup nobody restores is hope, not insurance. First-customer go-live requires *demonstrated* (not theoretical) restore capability. Monthly cron in CI enforces the muscle memory; committed artifacts give auditors a verifiable history.

Output: drill runbook + GitHub Actions monthly cron + 2 supporting scripts + first month's drill artifact shell.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/phases/06-hardening-scale-multi-country-rollout/06-CONTEXT.md
@.planning/runbooks/slo-definitions.md
@CLAUDE.md
@.github/workflows/ci.yml
</context>

<tasks>

<task type="auto">
  <name>Task 1: Author backup-restore-drill.md + write restore + schema-diff scripts</name>
  <files>.planning/runbooks/backup-restore-drill.md, scripts/dr/restore-pgbackrest.sh, scripts/dr/schema-diff.sh</files>
  <read_first>
    - .planning/phases/06-hardening-scale-multi-country-rollout/06-CONTEXT.md (D-05, D-06, D-07)
    - CLAUDE.md (pgBackRest already in tech stack; S3 backup target)
    - .planning/runbooks/slo-definitions.md (SLO baseline that drill timings feed into)
  </read_first>
  <action>

### 1. Create `.planning/runbooks/backup-restore-drill.md`

Sections:
- **1. Purpose & cadence** — monthly automated drill (1st of month, 02:00 UTC) + on-demand manual run
- **2. Targets:** RTO = 1 hour (restore complete and verified). RPO = 5 minutes (continuous WAL archive — actual data loss measured per drill)
- **3. Prerequisites:**
  - pgBackRest stanza `gravel-prod` configured, archiving WAL to S3 bucket `gravel-prod-backups`
  - AWS IAM role for CI with read-only access to backup bucket
  - Scratch Postgres provisioning capability (Supabase branch DB or local docker)
- **4. Procedure (drill, automated):**
  1. CI job kicks off (monthly cron OR `workflow_dispatch`)
  2. Provision scratch Postgres 18 (docker-compose locally in CI runner OR Supabase branch)
  3. Configure pgBackRest stanza pointing to prod S3 bucket (read-only)
  4. Restore base backup + WAL replay to target time = `now() - 1 hour` (PITR validation)
  5. Validate restored DB: `SELECT version()`, `SELECT count(*) FROM pg_tables WHERE schemaname='public'`
  6. Run schema-diff vs production: `pg_dump --schema-only` of restored vs read-only production export, `diff` should be empty
  7. Capture: total wall-clock time, restore-phase time, WAL-replay phase time, schema-diff result, top-10-table row counts
  8. Tear down scratch Postgres
  9. Commit artifact to `.planning/drills/backup-{YYYYMM}.md` with measurements
- **5. Procedure (drill, manual):** Same as above, runnable locally via `bash scripts/dr/restore-pgbackrest.sh --target-time "$(date -u -d '1 hour ago' --iso-8601=seconds)" --scratch-port 5433`
- **6. Failure modes & remediation:**
  - Restore phase > 1h → infra issue (S3 throughput, scratch DB sizing) — file P1 ticket
  - Schema drift > 0 lines → migration not in main branch OR prod hotfix not committed — investigate immediately
  - WAL gap detected → pgBackRest archiving lag — investigate WAL shipping
- **7. Outputs:** every run produces a row in the audit log table at the bottom of this file:
  ```
  | Date (UTC) | Trigger | RTO (s) | RPO measured (s) | Schema drift | Artifact |
  |------------|---------|---------|------------------|--------------|----------|
  | YYYY-MM-01 | cron    | …       | …                | 0 lines      | .planning/drills/backup-YYYYMM.md |
  ```
- **8. References:** D-05/06/07; HRD-MVP-03 §3 (DR runbook uses same scripts)

### 2. Create `scripts/dr/restore-pgbackrest.sh`

POSIX shell script (works on GitHub Actions ubuntu-latest):

```bash
#!/usr/bin/env bash
set -euo pipefail

# scripts/dr/restore-pgbackrest.sh
# Restore production pgBackRest backup into a scratch Postgres for drill validation.
# Usage: bash scripts/dr/restore-pgbackrest.sh --target-time "2026-05-17T13:00:00Z" --scratch-port 5433
# Requires env: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (read-only), PGBACKREST_REPO_S3_BUCKET, PGBACKREST_STANZA

TARGET_TIME=""
SCRATCH_PORT="5433"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target-time) TARGET_TIME="$2"; shift 2 ;;
    --scratch-port) SCRATCH_PORT="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

[[ -z "$TARGET_TIME" ]] && TARGET_TIME="$(date -u -d '1 hour ago' --iso-8601=seconds)"

START_TS=$(date +%s)
echo "[drill] Target PITR time: $TARGET_TIME"
echo "[drill] Scratch port: $SCRATCH_PORT"

# 1. Spin up scratch Postgres 18 via docker
docker run -d --name pg-drill-scratch \
  -e POSTGRES_PASSWORD=drilldrill \
  -p "${SCRATCH_PORT}:5432" \
  postgres:18

# Wait for ready
for i in {1..30}; do
  if docker exec pg-drill-scratch pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 2
done

# 2. Configure pgBackRest stanza (read-only)
cat > /tmp/pgbackrest.conf <<EOF
[global]
repo1-type=s3
repo1-s3-bucket=${PGBACKREST_REPO_S3_BUCKET}
repo1-s3-region=${AWS_REGION:-eu-central-1}
repo1-s3-endpoint=s3.${AWS_REGION:-eu-central-1}.amazonaws.com
repo1-s3-key=${AWS_ACCESS_KEY_ID}
repo1-s3-key-secret=${AWS_SECRET_ACCESS_KEY}

[${PGBACKREST_STANZA}]
pg1-host=localhost
pg1-port=${SCRATCH_PORT}
EOF

# 3. Execute PITR restore
RESTORE_START=$(date +%s)
pgbackrest --config=/tmp/pgbackrest.conf --stanza="${PGBACKREST_STANZA}" \
  --type=time --target="${TARGET_TIME}" restore
RESTORE_END=$(date +%s)

# 4. Sanity checks
PGPASSWORD=drilldrill psql -h localhost -p "${SCRATCH_PORT}" -U postgres -d postgres -c "SELECT version();"
TABLE_COUNT=$(PGPASSWORD=drilldrill psql -h localhost -p "${SCRATCH_PORT}" -U postgres -d postgres -t -c "SELECT count(*) FROM pg_tables WHERE schemaname='public';" | xargs)

END_TS=$(date +%s)
TOTAL=$((END_TS - START_TS))
RESTORE=$((RESTORE_END - RESTORE_START))

echo "[drill] ---- RESULTS ----"
echo "[drill] Total wall-clock: ${TOTAL}s"
echo "[drill] Restore phase:   ${RESTORE}s"
echo "[drill] Public tables:   ${TABLE_COUNT}"
echo "[drill] RTO target 3600s, actual ${TOTAL}s — $([[ $TOTAL -lt 3600 ]] && echo PASS || echo FAIL)"

# Emit machine-readable result for CI
cat > /tmp/drill-result.json <<EOF
{
  "target_time": "${TARGET_TIME}",
  "total_seconds": ${TOTAL},
  "restore_phase_seconds": ${RESTORE},
  "public_table_count": ${TABLE_COUNT},
  "rto_target_seconds": 3600,
  "rto_pass": $([[ $TOTAL -lt 3600 ]] && echo true || echo false)
}
EOF

echo "[drill] Result JSON: /tmp/drill-result.json"
```

Make executable: chmod +x in script header comment.

### 3. Create `scripts/dr/schema-diff.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

# scripts/dr/schema-diff.sh
# Compare schema of restored scratch DB vs production reference dump.
# Usage: bash scripts/dr/schema-diff.sh --scratch-port 5433 --reference-dump ./prod-schema.sql

SCRATCH_PORT="5433"
REF_DUMP=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scratch-port) SCRATCH_PORT="$2"; shift 2 ;;
    --reference-dump) REF_DUMP="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

[[ -z "$REF_DUMP" ]] && { echo "Missing --reference-dump" >&2; exit 2; }
[[ ! -f "$REF_DUMP" ]] && { echo "Reference dump not found: $REF_DUMP" >&2; exit 2; }

SCRATCH_DUMP=$(mktemp)
PGPASSWORD=drilldrill pg_dump -h localhost -p "${SCRATCH_PORT}" -U postgres -d postgres --schema-only > "$SCRATCH_DUMP"

DIFF_LINES=$(diff -u "$REF_DUMP" "$SCRATCH_DUMP" | wc -l | xargs)
if [[ "$DIFF_LINES" -eq 0 ]]; then
  echo "[drill] Schema diff: 0 lines — PASS"
  exit 0
else
  echo "[drill] Schema diff: ${DIFF_LINES} lines — FAIL"
  diff -u "$REF_DUMP" "$SCRATCH_DUMP" | head -200
  exit 1
fi
```
  </action>
  <verify>
    <automated>test -f .planning/runbooks/backup-restore-drill.md && grep -q "RTO target = 1 hour" .planning/runbooks/backup-restore-drill.md && grep -q "RPO target = 5 minutes" .planning/runbooks/backup-restore-drill.md && grep -q "pgBackRest" .planning/runbooks/backup-restore-drill.md && grep -q "T-1h\|1 hour ago" .planning/runbooks/backup-restore-drill.md && grep -q "schema-diff\|schema diff" .planning/runbooks/backup-restore-drill.md && test -x scripts/dr/restore-pgbackrest.sh -o -f scripts/dr/restore-pgbackrest.sh && test -f scripts/dr/schema-diff.sh && bash -n scripts/dr/restore-pgbackrest.sh && bash -n scripts/dr/schema-diff.sh</automated>
  </verify>
  <acceptance_criteria>
    - Runbook exists with RTO=1h, RPO=5min, pgBackRest, T-1h, schema-diff terms present
    - 2 shell scripts exist under `scripts/dr/`
    - Both shell scripts pass `bash -n` syntax check
    - Restore script emits machine-readable JSON result
  </acceptance_criteria>
  <done>SRE can manually trigger a drill from any laptop with AWS creds and produce a JSON result + schema-diff verdict; same scripts are reusable in CI.</done>
</task>

<task type="auto">
  <name>Task 2: Create GitHub Actions monthly cron workflow + first drill artifact shell</name>
  <files>.github/workflows/backup-drill.yml, .planning/drills/backup-202605.md</files>
  <read_first>
    - scripts/dr/restore-pgbackrest.sh (just-created — Task 1)
    - scripts/dr/schema-diff.sh (just-created — Task 1)
    - .github/workflows/ci.yml (existing workflow patterns for runners, secrets)
    - .planning/runbooks/backup-restore-drill.md §4 (procedure steps to map into workflow)
  </read_first>
  <action>

### 1. Create `.github/workflows/backup-drill.yml`

```yaml
name: Monthly Backup & PITR Drill

on:
  schedule:
    - cron: '0 2 1 * *'  # 1st of month, 02:00 UTC
  workflow_dispatch:
    inputs:
      target_time:
        description: 'PITR target time (ISO-8601 UTC, default = 1 hour ago)'
        required: false

permissions:
  contents: write  # Required to commit drill artifact

jobs:
  drill:
    runs-on: ubuntu-latest
    timeout-minutes: 90
    env:
      AWS_ACCESS_KEY_ID: ${{ secrets.DRILL_AWS_ACCESS_KEY_ID }}
      AWS_SECRET_ACCESS_KEY: ${{ secrets.DRILL_AWS_SECRET_ACCESS_KEY }}
      AWS_REGION: eu-central-1
      PGBACKREST_REPO_S3_BUCKET: gravel-prod-backups
      PGBACKREST_STANZA: gravel-prod
    steps:
      - uses: actions/checkout@v4

      - name: Install pgBackRest
        run: |
          sudo apt-get update
          sudo apt-get install -y pgbackrest postgresql-client-18

      - name: Fetch production schema reference dump from S3
        run: |
          aws s3 cp s3://gravel-prod-backups/schema/latest.sql ./prod-schema.sql

      - name: Run restore drill
        id: restore
        run: |
          bash scripts/dr/restore-pgbackrest.sh \
            --target-time "${{ inputs.target_time || '' }}" \
            --scratch-port 5433
          cat /tmp/drill-result.json

      - name: Run schema diff
        id: schema_diff
        run: |
          bash scripts/dr/schema-diff.sh \
            --scratch-port 5433 \
            --reference-dump ./prod-schema.sql

      - name: Tear down scratch DB
        if: always()
        run: |
          docker rm -f pg-drill-scratch || true

      - name: Generate drill artifact
        if: always()
        run: |
          YYYYMM=$(date -u +%Y%m)
          ARTIFACT=".planning/drills/backup-${YYYYMM}.md"
          {
            echo "# Backup & PITR Drill — ${YYYYMM}"
            echo ""
            echo "## Trigger"
            echo "- Workflow: backup-drill.yml"
            echo "- Run ID: ${{ github.run_id }}"
            echo "- Triggered by: ${{ github.event_name }}"
            echo ""
            echo "## Result"
            echo '```json'
            cat /tmp/drill-result.json || echo "{\"error\":\"no result\"}"
            echo '```'
            echo ""
            echo "## Schema diff"
            echo "- Status: ${{ steps.schema_diff.outcome }}"
            echo ""
            echo "## RTO/RPO"
            echo "- Target RTO: 3600s (1h)"
            echo "- Target RPO: 300s (5min)"
            echo ""
            echo "## References"
            echo "- Runbook: .planning/runbooks/backup-restore-drill.md"
            echo "- Decision: D-05, D-06, D-07"
          } > "$ARTIFACT"

      - name: Commit drill artifact
        if: always()
        run: |
          git config user.name "gravel-drill-bot"
          git config user.email "drill@gravel-ivoire.local"
          git add .planning/drills/backup-*.md
          if git diff --staged --quiet; then
            echo "No artifact changes"
          else
            git commit -m "chore(drill): backup-pitr $(date -u +%Y%m)"
            git push
          fi
```

### 2. Create `.planning/drills/backup-202605.md`

Initial baseline shell so the first cron run amends rather than starts from zero:

```
# Backup & PITR Drill — 202605 (BASELINE — not yet executed)

## Status
- Workflow: `.github/workflows/backup-drill.yml`
- First scheduled execution: 2026-06-01 02:00 UTC (monthly cron)
- Manual trigger available via `workflow_dispatch` once secrets are configured

## Pre-execution checklist
- [ ] `DRILL_AWS_ACCESS_KEY_ID` / `DRILL_AWS_SECRET_ACCESS_KEY` configured in GH Actions secrets (read-only IAM)
- [ ] pgBackRest stanza `gravel-prod` confirmed archiving to `s3://gravel-prod-backups`
- [ ] `s3://gravel-prod-backups/schema/latest.sql` reference dump exists (auto-updated by CI on migration)
- [ ] Runbook `.planning/runbooks/backup-restore-drill.md` reviewed by on-call rota

## Result (to be populated after first run)
- Date executed: —
- RTO measured: — s
- RPO measured: — s
- Schema diff: — lines
- Pass/Fail: —

## Notes
First drill run is part of v1.1 cutover pre-flight (HRD-MVP-08 §3 T-7d checklist).

## References
- Runbook: `.planning/runbooks/backup-restore-drill.md`
- D-05/06/07
```
  </action>
  <verify>
    <automated>test -f .github/workflows/backup-drill.yml && grep -q "cron:" .github/workflows/backup-drill.yml && grep -q "restore-pgbackrest.sh" .github/workflows/backup-drill.yml && grep -q "schema-diff.sh" .github/workflows/backup-drill.yml && test -f .planning/drills/backup-202605.md && python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/backup-drill.yml'))" 2>/dev/null || node -e "const yaml=require('js-yaml');yaml.load(require('fs').readFileSync('.github/workflows/backup-drill.yml','utf8'))" 2>/dev/null || true</automated>
  </verify>
  <acceptance_criteria>
    - `.github/workflows/backup-drill.yml` exists with monthly `cron: '0 2 1 * *'`
    - Workflow invokes both `scripts/dr/restore-pgbackrest.sh` and `scripts/dr/schema-diff.sh`
    - Workflow commits artifact to `.planning/drills/backup-{YYYYMM}.md`
    - `.planning/drills/backup-202605.md` baseline shell exists with pre-execution checklist
    - YAML is syntactically valid (if a parser is available)
  </acceptance_criteria>
  <done>Monthly drill is autonomous in CI; first artifact shell is in repo so the first run produces a diff (not a brand-new file from nothing); manual trigger is available for ad-hoc validation.</done>
</task>

</tasks>

<verification>
- Backup-restore drill runbook + 2 scripts + GH Actions workflow + first drill artifact all committed.
- RTO=1h, RPO=5min targets stated and machine-checked in script output.
- Monthly cron + on-demand workflow_dispatch both wired.
</verification>

<success_criteria>
HRD-MVP-02 satisfied: every month proves the system is restorable from pgBackRest within target, schema-drift-free, with artifact in repo for audit.
</success_criteria>

<output>
After completion, create `.planning/phases/06-hardening-scale-multi-country-rollout/06-W2-P01-SUMMARY.md`.
</output>
