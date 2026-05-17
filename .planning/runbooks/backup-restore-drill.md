# Backup & PITR Drill Runbook

> Phase 6 — HRD-MVP-02 — D-05/06/07
> Owners: SRE on-call rota
> Last reviewed: 2026-05-17

---

## 1. Purpose & cadence

A backup nobody restores is hope, not insurance. This runbook documents the **monthly automated drill** that proves we can restore the production database from `pgBackRest` within the agreed RTO/RPO, with **zero schema drift** between the restored snapshot and live production.

- **Automated cadence:** monthly via GitHub Actions cron — `cron: '0 2 1 * *'` (1st of month, 02:00 UTC).
- **On-demand cadence:** any time, via `workflow_dispatch` on `.github/workflows/backup-drill.yml`, OR locally with `scripts/dr/restore-pgbackrest.sh`.
- **Pre-cutover trigger:** mandatory clean drill before every v1.x cutover (see `.planning/runbooks/v1.1-cutover.md` T-7d checklist).

---

## 2. Targets

| Target | Value | Notes |
|--------|-------|-------|
| **RTO target = 1 hour** | 3 600 s wall-clock end-to-end | From cron trigger to verified `SELECT version()` on the restored DB. |
| **RPO target = 5 minutes** | 300 s | Continuous WAL archive every 60 s; worst-case RPO = last successful WAL segment ship. |
| Drill PITR target | T-1h | Restore to `now() - 1 hour` to validate PITR recovery (not just latest base backup). |
| Schema drift assertion | **0 lines** | `pg_dump --schema-only` diff between restored DB and the prod schema reference dump. |

Gaps above target are **logged in the drill artifact** and trigger a P1 ticket; they do not silently pass.

---

## 3. Prerequisites

Before the first drill, the following must be confirmed in production:

- [ ] pgBackRest stanza `gravel-prod` exists and is **archiving WAL to S3** bucket `gravel-prod-backups`.
- [ ] A reference **schema-only dump** is uploaded to `s3://gravel-prod-backups/schema/latest.sql` after every migration (wired in `.github/workflows/deploy.yml` post-migrate step — to be added separately if not present).
- [ ] An **AWS IAM role for CI** with **read-only** access to the backup bucket is provisioned; credentials available in GitHub Actions secrets as `DRILL_AWS_ACCESS_KEY_ID` / `DRILL_AWS_SECRET_ACCESS_KEY`.
- [ ] **Scratch Postgres** can be provisioned in CI — implementation here uses `docker run postgres:18` on the ubuntu-latest runner; alternatively a Supabase branch DB can be used.
- [ ] `pgbackrest` and `postgresql-client-18` are installable via `apt-get` on the runner (validated by the workflow).

---

## 4. Procedure (drill, automated)

The full chain is executed by `.github/workflows/backup-drill.yml`. Steps it performs:

1. **Trigger.** Monthly cron OR manual `workflow_dispatch` (with optional `target_time` input). All triggers honour the same flow.
2. **Provision scratch Postgres 18** on the runner — `docker run` pinned to `postgres:18`, mapped to a non-default port (5433) to avoid colliding with any system service.
3. **Configure pgBackRest stanza** pointing to the prod S3 bucket as a **read-only** repo.
4. **Restore base backup + WAL replay to T-1h** — `pgbackrest restore --type=time --target=<now-1h>`. This validates **PITR**, not just the latest base backup.
5. **Sanity-validate the restored DB** — `SELECT version();` succeeds, `SELECT count(*) FROM pg_tables WHERE schemaname='public'` returns a non-zero count matching expectations.
6. **Schema-diff vs production** — `scripts/dr/schema-diff.sh`. Fetches the canonical reference dump (`s3://gravel-prod-backups/schema/latest.sql`) and asserts `diff -u` returns 0 lines.
7. **Capture measurements** — total wall-clock, restore phase, schema-diff lines, table count → `/tmp/drill-result.json`.
8. **Tear down** scratch Postgres (`docker rm -f pg-drill-scratch`, always runs).
9. **Commit artifact** to `.planning/drills/backup-{YYYYMM}.md` with full result block — auditors can read history without S3 access.

---

## 5. Procedure (drill, manual)

Any engineer with AWS credentials (read-only on backup bucket) can run the drill locally:

```bash
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=...
export AWS_REGION=eu-central-1
export PGBACKREST_REPO_S3_BUCKET=gravel-prod-backups
export PGBACKREST_STANZA=gravel-prod

# Run the restore (defaults: --target-time = 1 hour ago, --scratch-port = 5433)
bash scripts/dr/restore-pgbackrest.sh \
  --target-time "$(date -u -d '1 hour ago' --iso-8601=seconds)" \
  --scratch-port 5433

# Run the schema-diff (download the reference dump first)
aws s3 cp s3://gravel-prod-backups/schema/latest.sql ./prod-schema.sql
bash scripts/dr/schema-diff.sh \
  --scratch-port 5433 \
  --reference-dump ./prod-schema.sql
```

Results land in `/tmp/drill-result.json` and stdout. Tear-down: `docker rm -f pg-drill-scratch`.

---

## 6. Failure modes & remediation

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| Restore phase wall-clock > 3 600 s | S3 read throughput, scratch DB sizing, or WAL volume too large | File **P1 ticket**, attach drill artifact, evaluate larger CI runner / parallel restore (`pgbackrest restore --process-max=N`). |
| `schema-diff` > 0 lines | Migration in main branch not yet applied to prod, OR prod hotfix not committed to main | **Investigate immediately** — chase the migration owner, reconcile within 24 h. |
| WAL gap detected during replay (PITR fails) | pgBackRest archiving lag or S3 outage | Inspect `archive_command` health, check pgBackRest logs on prod, **escalate** if gap > RPO. |
| Reference dump missing in S3 | Post-migrate dump step in `deploy.yml` failed | Re-run last successful deploy's post-migrate step; fix the workflow. |
| Docker fails to start on runner | Runner image change | Pin runner to a known-good ubuntu-latest hash; re-run. |

---

## 7. Outputs — audit log

Every drill run appends a row here, and a full artifact at `.planning/drills/backup-{YYYYMM}.md`.

| Date (UTC) | Trigger | RTO (s) | RPO measured (s) | Schema drift | Artifact |
|------------|---------|---------|------------------|--------------|----------|
| 2026-06-01 | cron (planned) | — | — | — | `.planning/drills/backup-202606.md` (pending first run) |
| 2026-05-17 | baseline shell | — | — | — | `.planning/drills/backup-202605.md` (template — not yet executed) |

---

## 8. References

- **Decisions:** D-05 (monthly cron + scratch DB + PITR T-1h + schema-diff), D-06 (RTO=1h / RPO=5min), D-07 (artifact commit for audit trail) — see `.planning/phases/06-hardening-scale-multi-country-rollout/06-CONTEXT.md`.
- **Downstream consumer:** HRD-MVP-03 §3 DR runbook scenario #1 (primary DB total loss) reuses the same scripts.
- **SLO feed:** drill timings (RTO/RPO measured) feed the SLO baseline established in `.planning/runbooks/slo-definitions.md` (W1-P04).
- **Tooling:** pgBackRest (CLAUDE.md tech stack — pgBackRest 2.55+, S3-compatible repo).
- **Scripts:** `scripts/dr/restore-pgbackrest.sh`, `scripts/dr/schema-diff.sh`.
- **Workflow:** `.github/workflows/backup-drill.yml`.
