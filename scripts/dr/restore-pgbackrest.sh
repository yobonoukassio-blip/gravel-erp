#!/usr/bin/env bash
# scripts/dr/restore-pgbackrest.sh
# Restore production pgBackRest backup into a scratch Postgres for drill validation.
#
# Usage:
#   bash scripts/dr/restore-pgbackrest.sh \
#     --target-time "2026-05-17T13:00:00Z" \
#     --scratch-port 5433
#
# Requires env:
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY  (read-only on backup bucket)
#   PGBACKREST_REPO_S3_BUCKET                 (e.g. gravel-prod-backups)
#   PGBACKREST_STANZA                         (e.g. gravel-prod)
#   AWS_REGION                                (default: eu-central-1)
#
# Emits machine-readable JSON to /tmp/drill-result.json on success.

set -euo pipefail

TARGET_TIME=""
SCRATCH_PORT="5433"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target-time) TARGET_TIME="$2"; shift 2 ;;
    --scratch-port) SCRATCH_PORT="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,17p' "$0"
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

# Default: 1 hour ago, ISO-8601 UTC.
if [[ -z "$TARGET_TIME" ]]; then
  TARGET_TIME="$(date -u -d '1 hour ago' --iso-8601=seconds 2>/dev/null || date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)"
fi

# Required env sanity-check.
: "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID env var required}"
: "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY env var required}"
: "${PGBACKREST_REPO_S3_BUCKET:?PGBACKREST_REPO_S3_BUCKET env var required}"
: "${PGBACKREST_STANZA:?PGBACKREST_STANZA env var required}"

AWS_REGION="${AWS_REGION:-eu-central-1}"

START_TS=$(date +%s)
echo "[drill] Target PITR time: $TARGET_TIME"
echo "[drill] Scratch port:     $SCRATCH_PORT"
echo "[drill] S3 bucket:        $PGBACKREST_REPO_S3_BUCKET"
echo "[drill] Stanza:           $PGBACKREST_STANZA"
echo "[drill] Region:           $AWS_REGION"

# 1. Spin up scratch Postgres 18 via docker.
docker rm -f pg-drill-scratch >/dev/null 2>&1 || true
docker run -d --name pg-drill-scratch \
  -e POSTGRES_PASSWORD=drilldrill \
  -p "${SCRATCH_PORT}:5432" \
  postgres:18

# 2. Wait for Postgres to be ready (max ~60s).
READY=0
for i in {1..30}; do
  if docker exec pg-drill-scratch pg_isready -U postgres >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 2
done
if [[ "$READY" -ne 1 ]]; then
  echo "[drill] FATAL: scratch Postgres did not become ready in 60s" >&2
  exit 1
fi

# 3. Configure pgBackRest stanza (read-only against prod S3).
cat > /tmp/pgbackrest.conf <<EOF
[global]
repo1-type=s3
repo1-s3-bucket=${PGBACKREST_REPO_S3_BUCKET}
repo1-s3-region=${AWS_REGION}
repo1-s3-endpoint=s3.${AWS_REGION}.amazonaws.com
repo1-s3-key=${AWS_ACCESS_KEY_ID}
repo1-s3-key-secret=${AWS_SECRET_ACCESS_KEY}

[${PGBACKREST_STANZA}]
pg1-host=localhost
pg1-port=${SCRATCH_PORT}
EOF

# 4. Execute PITR restore.
RESTORE_START=$(date +%s)
pgbackrest --config=/tmp/pgbackrest.conf --stanza="${PGBACKREST_STANZA}" \
  --type=time --target="${TARGET_TIME}" restore
RESTORE_END=$(date +%s)

# 5. Sanity checks.
PGPASSWORD=drilldrill psql -h localhost -p "${SCRATCH_PORT}" -U postgres -d postgres -c "SELECT version();"
TABLE_COUNT=$(PGPASSWORD=drilldrill psql -h localhost -p "${SCRATCH_PORT}" -U postgres -d postgres -t -c \
  "SELECT count(*) FROM pg_tables WHERE schemaname='public';" | tr -d '[:space:]')

END_TS=$(date +%s)
TOTAL=$((END_TS - START_TS))
RESTORE=$((RESTORE_END - RESTORE_START))

RTO_PASS="false"
if [[ "$TOTAL" -lt 3600 ]]; then RTO_PASS="true"; fi

echo "[drill] ---- RESULTS ----"
echo "[drill] Total wall-clock: ${TOTAL}s"
echo "[drill] Restore phase:    ${RESTORE}s"
echo "[drill] Public tables:    ${TABLE_COUNT}"
echo "[drill] RTO target 3600s, actual ${TOTAL}s — $([[ "$RTO_PASS" == "true" ]] && echo PASS || echo FAIL)"

# 6. Emit machine-readable result for CI.
cat > /tmp/drill-result.json <<EOF
{
  "target_time": "${TARGET_TIME}",
  "total_seconds": ${TOTAL},
  "restore_phase_seconds": ${RESTORE},
  "public_table_count": ${TABLE_COUNT},
  "rto_target_seconds": 3600,
  "rpo_target_seconds": 300,
  "rto_pass": ${RTO_PASS}
}
EOF

echo "[drill] Result JSON: /tmp/drill-result.json"
