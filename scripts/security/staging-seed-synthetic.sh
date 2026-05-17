#!/usr/bin/env bash
set -euo pipefail

# scripts/security/staging-seed-synthetic.sh
# Seed staging with SYNTHETIC data only — never copy production.
# Per HRD-MVP-01 D-02 + Phase 6 CONTEXT "Production-like data for pen-test":
# generate with the existing db:seed:demo script, NOT a copy of production.
# RLS leak risk if production data ever touches staging.

if [[ -z "${STAGING_DATABASE_URL:-}" ]]; then
  echo "ERROR: STAGING_DATABASE_URL must be set" >&2
  exit 2
fi

# Sanity guard: ensure we are NOT pointed at prod
if [[ "${STAGING_DATABASE_URL}" == *"-prod"* ]] \
  || [[ "${STAGING_DATABASE_URL}" == *"production"* ]] \
  || [[ "${STAGING_DATABASE_URL}" == *"prod."* ]]; then
  echo "ABORT: STAGING_DATABASE_URL appears to point at production — refusing to seed" >&2
  exit 3
fi

echo "[seed] Running db:seed:demo against staging…"
DATABASE_URL="${STAGING_DATABASE_URL}" pnpm --filter api db:seed:demo

echo "[seed] Done. Staging seeded with synthetic tenants, sites, users, equipment."
echo "[seed] Verify: psql \"${STAGING_DATABASE_URL}\" -c \"SELECT count(*) FROM tenant;\""
