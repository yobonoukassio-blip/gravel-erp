#!/usr/bin/env bash
set -euo pipefail

# scripts/security/zap-baseline.sh
# Run OWASP ZAP baseline scan against a staging URL.
# Usage: bash scripts/security/zap-baseline.sh https://staging-gravel.vercel.app
#
# Per HRD-MVP-01 procedure §4 Phase A step 4. FOSS-only tooling per
# feedback_free_tools_only. Outputs HTML + JSON reports for triage into
# .planning/pen-tests/{YYYY-Qn}-internal-red-team/FINDINGS.md

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
