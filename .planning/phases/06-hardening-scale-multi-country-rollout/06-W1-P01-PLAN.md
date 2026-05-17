---
phase: 06-hardening-scale-multi-country-rollout
plan: W1-P01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/runbooks/secrets-rotation.md
  - scripts/rotation-and-purge/ROTATION-CHECKLIST.md
  - apps/api/.env.example
autonomous: true
requirements: [HRD-MVP-04]
requirements_covered: [HRD-MVP-04]
must_haves:
  truths:
    - "An on-call engineer can rotate any secret (Keycloak admin, JWT signing key, Brevo, Twilio, DB password, AWS S3 keys) by following a single canonical runbook with explicit cadence and verification per secret."
    - "JWT signing key rotation uses a documented dual-key window so live tokens are not invalidated mid-flight."
    - "P0-1 (.env.example baseline) and P0-2 (history purge script) are referenced from the runbook — no duplication."
    - "Each env var in apps/api/.env.example maps 1:1 to an entry in the rotation runbook."
  artifacts:
    - path: ".planning/runbooks/secrets-rotation.md"
      provides: "Per-secret rotation procedure with cadence, rollout sequence, verification, rollback"
      contains: "Keycloak admin"
      contains_all:
        - "Keycloak admin"
        - "JWT_SIGNING_KEY"
        - "BREVO_API_KEY"
        - "TWILIO_AUTH_TOKEN"
        - "DB_PASSWORD"
        - "AWS_S3_ACCESS_KEY"
        - "dual-key window"
  key_links:
    - from: ".planning/runbooks/secrets-rotation.md"
      to: "scripts/rotation-and-purge/ROTATION-CHECKLIST.md"
      via: "explicit link reference"
      pattern: "rotation-and-purge"
    - from: ".planning/runbooks/secrets-rotation.md"
      to: "apps/api/.env.example"
      via: "env var inventory table"
      pattern: "\\.env\\.example"
---

<objective>
Produce the canonical Secrets Rotation Runbook (HRD-MVP-04) — a single document an on-call engineer can follow at 3am to rotate any production secret without breaking the live system. Fold P0-1 (.env.example sanitization) and P0-2 (history purge script) into this runbook rather than re-doing them.

Purpose: First-customer go-live requires demonstrable secret hygiene. Auditors and the client's CISO ask "show me your rotation runbook." Today the answer is "we have a partial checklist for Supabase only." This plan closes that gap for every secret in apps/api/.env.example with explicit cadence, ordered rotation sequence (especially the JWT dual-key window), and verification checks.

Output: `.planning/runbooks/secrets-rotation.md` covering 6 secret families per D-12, with each procedure linking to the already-shipped purge script (D-13).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/phases/06-hardening-scale-multi-country-rollout/06-CONTEXT.md
@scripts/rotation-and-purge/ROTATION-CHECKLIST.md
@apps/api/.env.example
@CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Write canonical Secrets Rotation Runbook covering all 6 secret families</name>
  <files>.planning/runbooks/secrets-rotation.md</files>
  <read_first>
    - .planning/phases/06-hardening-scale-multi-country-rollout/06-CONTEXT.md (decisions D-11, D-12, D-13)
    - scripts/rotation-and-purge/ROTATION-CHECKLIST.md (existing Supabase-only rotation; do NOT duplicate — link)
    - apps/api/.env.example (canonical secret surface)
    - CLAUDE.md (Keycloak 26 + AWS S3 + Brevo + Twilio stack constraints)
  </read_first>
  <action>
Create `.planning/runbooks/secrets-rotation.md` with the following sections, in order:

## 1. Purpose & Ownership
- One paragraph: this is the canonical rotation runbook; on-call DRI owns execution; quarterly review cadence.

## 2. Rotation Cadence Matrix (copy this table verbatim — D-12 values)

| Secret                  | Env var                           | Cadence | Rollout pattern                    | Verification                                                 |
|-------------------------|-----------------------------------|---------|------------------------------------|--------------------------------------------------------------|
| Keycloak admin password | (Keycloak admin console only)     | 90d     | atomic (single-admin window)       | `curl -X POST $KEYCLOAK_URL/realms/master/protocol/openid-connect/token` returns 200 with new password |
| JWT signing key         | `AUTH_JWT_SECRET`                 | 365d    | **dual-key window 24h**            | New tokens verify against new key; existing tokens still verify until TTL expires |
| Brevo API key           | `BREVO_API_KEY`                   | 180d    | atomic (single API key per env)    | Test email job via `pnpm --filter api ts-node scripts/test-brevo.ts` returns Brevo 200 |
| Twilio auth token       | `TWILIO_AUTH_TOKEN`               | 180d    | atomic                             | Test SMS via `scripts/test-twilio.ts` to ops phone returns SID |
| DB password (Supabase)  | `DATABASE_URL` password segment   | 90d     | rotate Supabase → update Railway env → restart API | `pnpm --filter api typeorm query "SELECT 1"` returns 1 |
| AWS S3 access keys      | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | 180d | create new pair → deploy → delete old after 24h | `aws s3 ls s3://$S3_HSE_BUCKET` returns object list |

## 3. ORDER MATTERS warning box
Copy the "ORDER MATTERS" callout from `scripts/rotation-and-purge/ROTATION-CHECKLIST.md` — ROTATE → PURGE, never reverse.

## 4. Per-secret procedures (6 subsections, one each)

For EACH of the 6 secrets above, write a subsection with this exact structure:

### 4.X {Secret name}
**Cadence:** {from matrix}
**Owner:** SRE on-call
**Prerequisites:** {list — e.g., "Supabase dashboard access", "Railway project access"}

**Steps:**
1. {Numbered concrete steps — for Supabase DB password, LINK to `scripts/rotation-and-purge/ROTATION-CHECKLIST.md` rather than duplicate; for the other 5, write fresh steps with explicit URLs (https://app.brevo.com/settings/keys/api, https://console.twilio.com/, Keycloak admin UI path /admin/master/console/, AWS IAM console)}

**JWT dual-key window (4.2 only):**
- Step A: Generate new key with `openssl rand -hex 64` (≥32 bytes per .env.example comment).
- Step B: Deploy with BOTH keys present (`AUTH_JWT_SECRET=newkey`, `AUTH_JWT_SECRET_PREVIOUS=oldkey`). Code change required in JwtAuthGuard to try both — document as follow-up if not yet implemented, mark as TECH-DEBT-001 in the runbook.
- Step C: Wait 24h (longer than max JWT TTL).
- Step D: Remove `AUTH_JWT_SECRET_PREVIOUS`, redeploy.
- Step E: Verify with `curl -H "Authorization: Bearer {token-issued-pre-rotation}"` returns 401.

**Verification:** {from matrix}
**Rollback:** {explicit — e.g., "Re-apply old key in Railway, redeploy, investigate failure root cause before retry"}

## 5. Post-rotation: git history purge
Link to `scripts/rotation-and-purge/purge-secrets-from-history.sh` with a one-line "only run after all collaborators are notified and rotation is verified" warning. Do NOT duplicate the script.

## 6. Audit log
Append a line per rotation event to `.planning/drills/rotations-{YYYY}.md` (date | secret | operator | verification result). Same pattern as the backup drills.

## 7. References
- D-11, D-12, D-13 in `.planning/phases/06-hardening-scale-multi-country-rollout/06-CONTEXT.md`
- `scripts/rotation-and-purge/ROTATION-CHECKLIST.md`
- `apps/api/.env.example`

Per D-13, do NOT re-implement P0-1 or P0-2 — reference them.
  </action>
  <verify>
    <automated>test -f .planning/runbooks/secrets-rotation.md && grep -qE "(Keycloak admin|JWT_SIGNING_KEY|AUTH_JWT_SECRET)" .planning/runbooks/secrets-rotation.md && grep -q "BREVO_API_KEY" .planning/runbooks/secrets-rotation.md && grep -q "TWILIO_AUTH_TOKEN" .planning/runbooks/secrets-rotation.md && grep -q "DATABASE_URL" .planning/runbooks/secrets-rotation.md && grep -q "AWS_ACCESS_KEY_ID" .planning/runbooks/secrets-rotation.md && grep -q "dual-key window" .planning/runbooks/secrets-rotation.md && grep -q "rotation-and-purge" .planning/runbooks/secrets-rotation.md</automated>
  </verify>
  <acceptance_criteria>
    - File `.planning/runbooks/secrets-rotation.md` exists
    - All 6 secret families have a dedicated subsection with cadence, steps, verification, rollback
    - JWT dual-key window is explicitly documented with 24h window (D-12)
    - Cadence values match D-12 verbatim: Keycloak/DB = 90d, API keys = 180d, JWT key = 365d
    - File links to `scripts/rotation-and-purge/ROTATION-CHECKLIST.md` and `scripts/rotation-and-purge/purge-secrets-from-history.sh` (does NOT duplicate them — D-13)
    - "ORDER MATTERS: ROTATE → PURGE" warning present
    - Audit log section instructs operator to append to `.planning/drills/rotations-{YYYY}.md`
  </acceptance_criteria>
  <done>An on-call engineer paged at 3am for a suspected secret leak can open the runbook, identify the affected secret, rotate it with explicit verification, and know whether to run the history purge afterward — without reading any other document.</done>
</task>

<task type="auto">
  <name>Task 2: Cross-link .env.example to runbook + create rotations log shell</name>
  <files>apps/api/.env.example, .planning/drills/rotations-2026.md</files>
  <read_first>
    - apps/api/.env.example (read all comment headers; do NOT modify any actual values)
    - .planning/runbooks/secrets-rotation.md (just-created — Task 1 output)
  </read_first>
  <action>
1. Edit `apps/api/.env.example` — add a single comment block at the top (after the existing security header, before `NODE_ENV=development`):

```
# ─── ROTATION ────────────────────────────────────────────────────────────────
# Every secret in this file has a rotation procedure in
#   .planning/runbooks/secrets-rotation.md
# Cadences: Keycloak/DB = 90d, BREVO/TWILIO/AWS = 180d, JWT key = 365d (dual-key).
# Log every rotation in .planning/drills/rotations-{YYYY}.md
```

Do NOT change any actual values, variable names, or other comments — additive edit only.

2. Create `.planning/drills/rotations-2026.md` shell file with this content:

```
# Secrets Rotation Log — 2026

Append one row per rotation event. Procedure: .planning/runbooks/secrets-rotation.md

| Date (UTC) | Secret | Operator | Cadence due | Verification result | Notes |
|------------|--------|----------|-------------|---------------------|-------|
| _example_  | _JWT signing key_ | _ops@gravel_ | _next: 2027-05-17_ | _ok_ | _dual-key window 24h respected_ |
```
  </action>
  <verify>
    <automated>grep -q "secrets-rotation.md" apps/api/.env.example && test -f .planning/drills/rotations-2026.md && grep -q "Rotation Log" .planning/drills/rotations-2026.md</automated>
  </verify>
  <acceptance_criteria>
    - `apps/api/.env.example` contains a ROTATION header block pointing to `.planning/runbooks/secrets-rotation.md`
    - No existing variable in `.env.example` was deleted or renamed (verify with `git diff` — only additive lines)
    - `.planning/drills/rotations-2026.md` exists with the table shell
  </acceptance_criteria>
  <done>The .env.example surface inventory is discoverable from a single comment block; operators have a per-year log to append to without needing to invent a structure.</done>
</task>

</tasks>

<verification>
- `.planning/runbooks/secrets-rotation.md` covers all 6 secret families from D-11/D-12.
- Cadence table matches D-12 verbatim.
- JWT dual-key window documented.
- Cross-link from `.env.example` to runbook exists.
- `.planning/drills/rotations-2026.md` shell created.
</verification>

<success_criteria>
HRD-MVP-04 satisfied: an on-call engineer has a single canonical document to rotate any production secret with explicit cadence, sequence, verification, and rollback per D-11/D-12/D-13.
</success_criteria>

<output>
After completion, create `.planning/phases/06-hardening-scale-multi-country-rollout/06-W1-P01-SUMMARY.md`.
</output>
