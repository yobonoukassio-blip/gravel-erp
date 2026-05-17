#!/usr/bin/env bash
# scripts/dr/schema-diff.sh
# Compare schema of restored scratch DB vs production reference dump.
#
# Usage:
#   bash scripts/dr/schema-diff.sh \
#     --scratch-port 5433 \
#     --reference-dump ./prod-schema.sql
#
# Exit codes:
#   0 = zero schema drift (PASS)
#   1 = drift detected (FAIL — first 200 diff lines printed)
#   2 = argument / pre-condition error

set -euo pipefail

SCRATCH_PORT="5433"
REF_DUMP=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scratch-port) SCRATCH_PORT="$2"; shift 2 ;;
    --reference-dump) REF_DUMP="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,14p' "$0"
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$REF_DUMP" ]]; then
  echo "Missing --reference-dump" >&2
  exit 2
fi
if [[ ! -f "$REF_DUMP" ]]; then
  echo "Reference dump not found: $REF_DUMP" >&2
  exit 2
fi

SCRATCH_DUMP=$(mktemp)
trap 'rm -f "$SCRATCH_DUMP"' EXIT

PGPASSWORD=drilldrill pg_dump \
  -h localhost \
  -p "${SCRATCH_PORT}" \
  -U postgres \
  -d postgres \
  --schema-only \
  > "$SCRATCH_DUMP"

DIFF_LINES=$(diff -u "$REF_DUMP" "$SCRATCH_DUMP" | wc -l | tr -d '[:space:]')

if [[ "$DIFF_LINES" -eq 0 ]]; then
  echo "[drill] Schema diff: 0 lines — PASS"
  exit 0
fi

echo "[drill] Schema diff: ${DIFF_LINES} lines — FAIL"
echo "[drill] ---- first 200 diff lines ----"
diff -u "$REF_DUMP" "$SCRATCH_DUMP" | head -200
exit 1
