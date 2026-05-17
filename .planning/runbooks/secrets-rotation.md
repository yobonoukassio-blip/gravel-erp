# Secrets Rotation Runbook — Gravel Ivoire API

**Status:** Canonical (HRD-MVP-04 — Phase 6 v1.1-MVP)
**Last review:** 2026-05-17
**Next review:** quarterly (every 90 days)

---

## 1. Purpose & Ownership

This is the **single canonical runbook** for rotating any production secret used by the Gravel Ivoire API. The on-call SRE is the DRI (Directly Responsible Individual) for executing rotations on schedule and during incidents (suspected leak, ex-employee offboarding, audit request). Every secret declared in `apps/api/.env.example` maps 1:1 to a procedure in section 4. The runbook is reviewed quarterly to keep cadences, URLs, and verification commands accurate.

Use this runbook when:

- A scheduled rotation is due (see cadence matrix in section 2)
- A secret is suspected leaked (rotate immediately, then run history purge — see section 5)
- An operator with secret access leaves the team (rotate every secret they could have read within 24h)
- A client CISO or auditor asks "show me your rotation procedure"

---

## 2. Rotation Cadence Matrix

Cadences below are the production targets locked in Phase 6 decision **D-12**. Calendar reminders are owned by the SRE on-call rotation; first overdue rotation pages the SRE channel.

| Secret                  | Env var                                       | Cadence | Rollout pattern                                              | Verification                                                                                          |
| ----------------------- | --------------------------------------------- | ------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Keycloak admin password | (Keycloak admin console only)                 | 90d     | atomic (single-admin window)                                 | `curl -X POST $KEYCLOAK_URL/realms/master/protocol/openid-connect/token` returns 200 with new password |
| JWT signing key         | `AUTH_JWT_SECRET`                             | 365d    | **dual-key window 24h**                                      | New tokens verify against new key; existing tokens still verify until TTL expires                     |
| Brevo API key           | `BREVO_API_KEY`                               | 180d    | atomic (single API key per env)                              | Test email job via `pnpm --filter api ts-node scripts/test-brevo.ts` returns Brevo 200                |
| Twilio auth token       | `TWILIO_AUTH_TOKEN`                           | 180d    | atomic                                                       | Test SMS via `scripts/test-twilio.ts` to ops phone returns SID                                        |
| DB password (Supabase)  | `DATABASE_URL` password segment               | 90d     | rotate Supabase → update Railway env → restart API           | `pnpm --filter api typeorm query "SELECT 1"` returns 1                                                |
| AWS S3 access keys      | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`  | 180d    | create new pair → deploy → delete old after 24h              | `aws s3 ls s3://$S3_HSE_BUCKET` returns object list                                                   |

Per D-12, JWT key rotation alone uses a dual-key window because in-flight bearer tokens must remain valid until their TTL elapses (default ≤24h). All other secrets are atomic — the moment the new value is deployed, the old becomes useless.

---

## 3. ⚠️ ORDER MATTERS — ROTATE → PURGE, never reverse

This callout is copied from `scripts/rotation-and-purge/ROTATION-CHECKLIST.md`. It applies to **every** secret in this runbook, not just the original Supabase incident:

> Do NOT purge history before rotating. The window between purge and rotation is when an attacker who already cloned the repo finalizes their exfiltration — the very act of force-pushing signals "we noticed" and accelerates abuse.
>
> **Correct order:**
>
> 1. Rotate the secret at the upstream provider (Supabase / Keycloak / Brevo / Twilio / AWS IAM)
> 2. Update the deployment environment variable (Railway / local `.env`)
> 3. Verify the application is healthy on the new value
> 4. **Then** purge git history if the secret ever touched a tracked file (section 5)
> 5. Force-push and notify collaborators

If you are tempted to skip rotation and "just purge the file" — stop. The leaked value is already cached in every clone, fork, and GitHub mirror that ever fetched the repo. Rotation invalidates the leaked value; purge only hides it from new clones.

---

## 4. Per-secret procedures

### 4.1 Keycloak admin password

**Cadence:** 90 days
**Owner:** SRE on-call
**Prerequisites:**
- Keycloak admin console access (URL: `$KEYCLOAK_URL/admin/master/console/`)
- Password manager (1Password / Bitwarden — never store rotated value in a file)

**Steps:**
1. Open `$KEYCLOAK_URL/admin/master/console/` and log in with the current admin credentials.
2. Navigate to **master realm → Users → admin → Credentials** tab.
3. Click **Reset Password**. Generate a new strong value (≥32 chars, mixed) via your password manager.
4. Untick "Temporary" so the new password is permanent.
5. Confirm. Store the new password in the team password manager under `gravel/keycloak/admin`.
6. If Keycloak admin password is *also* referenced by any automation (CI deploy scripts, terraform/opentofu state), update those env stores in the same session.

**Verification:**
```bash
curl -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&client_id=admin-cli&username=admin&password=$NEW_PASSWORD"
# expected: HTTP 200 with access_token in body
```

**Rollback:** Use Keycloak's built-in undo (Credentials tab → set the previous password from your password manager) within the same admin session. If you lose the new password mid-rotation, run the Keycloak `kc.sh bootstrap-admin user --username admin --password ...` command from the container shell to reset.

---

### 4.2 JWT signing key (`AUTH_JWT_SECRET`)

**Cadence:** 365 days
**Owner:** SRE on-call
**Prerequisites:**
- Railway project access (production API service)
- `openssl` available locally
- 24h scheduling window — dual-key rotation cannot be compressed below max JWT TTL

**Steps (dual-key window — D-12):**

- **Step A — Generate new key**
  ```bash
  openssl rand -hex 64
  ```
  Save output as `$NEW_JWT_SECRET`. Must be ≥32 bytes (the `openssl rand -hex 64` form yields 64 bytes = 128 hex chars; satisfies the `AUTH_JWT_SECRET` comment in `apps/api/.env.example`).

- **Step B — Deploy with BOTH keys present**
  In Railway production env, set:
  ```
  AUTH_JWT_SECRET=<new value from Step A>
  AUTH_JWT_SECRET_PREVIOUS=<current value before rotation>
  ```
  Redeploy. The `JwtAuthGuard` must try both secrets when verifying incoming tokens — verify with `apps/api/src/auth/jwt-auth.guard.ts`. **If dual-key support is not yet implemented in the guard, this is tracked as TECH-DEBT-001 (see Tech Debt section below) and you must STOP and implement it before rotating.**

- **Step C — Wait at least 24h**
  Longer than the max JWT TTL configured in `JwtModule.register({ signOptions: { expiresIn } })`. Default ERP TTL is 24h. If TTL is shorter, you can shorten the window.

- **Step D — Remove previous key**
  In Railway env, delete `AUTH_JWT_SECRET_PREVIOUS`. Redeploy.

- **Step E — Verify a pre-rotation token now fails**
  ```bash
  # Use a token captured before Step B (browser devtools → Network → Authorization header)
  curl -H "Authorization: Bearer $OLD_TOKEN" https://api.gravel-ivoire.app/auth/me
  # expected: HTTP 401 Unauthorized (token signed by retired key)
  ```

**Verification (steady-state — after Step D):**
```bash
# Issue a fresh token and confirm it verifies
curl -X POST https://api.gravel-ivoire.app/auth/login -d '{"email":"test@…","password":"…"}'
# then call a protected endpoint with the returned token → expect 200
```

**Rollback:** If Step B deploy breaks production (guard does not handle dual keys), redeploy with `AUTH_JWT_SECRET` reverted to the previous value and `AUTH_JWT_SECRET_PREVIOUS` removed. Investigate the JwtAuthGuard before retry — do NOT proceed with rotation until dual-key support is verified end-to-end on staging.

**Tech debt note (TECH-DEBT-001):** Verify on each rotation that `JwtAuthGuard` reads both `AUTH_JWT_SECRET` and `AUTH_JWT_SECRET_PREVIOUS` and tries them in order (new → old). If not, file a fix before the next 365d rotation comes due.

---

### 4.3 Brevo API key (`BREVO_API_KEY`)

**Cadence:** 180 days
**Owner:** SRE on-call (with notification lead sign-off)
**Prerequisites:**
- Brevo dashboard access (https://app.brevo.com/settings/keys/api)
- Railway project access

**Steps:**
1. Open https://app.brevo.com/settings/keys/api
2. Click **Generate a new API key**. Name it `gravel-prod-rotated-YYYY-MM-DD`.
3. Copy the new key — Brevo shows it once. Save to password manager under `gravel/brevo/api-key`.
4. In Railway production env, update `BREVO_API_KEY` with the new value.
5. Click **Deploy** in Railway. Wait for healthy deploy.
6. Once verified (next step), return to Brevo dashboard and **revoke** the previous key (button next to the old key row).

**Verification:**
```bash
pnpm --filter api ts-node scripts/test-brevo.ts
# expected: Brevo HTTP 200, messageId returned
# (script sends one test email to alerts@gravel-ivoire.app via BREVO_API_KEY from process.env)
```

**Rollback:** If step 5 deploy fails the test email, restore the previous key in Railway env (do NOT revoke it in Brevo until verified). Redeploy. Investigate before retry (common cause: API key scope mismatch — Brevo requires `transactional_email` permission).

---

### 4.4 Twilio auth token (`TWILIO_AUTH_TOKEN`)

**Cadence:** 180 days
**Owner:** SRE on-call (with notification lead sign-off)
**Prerequisites:**
- Twilio console access (https://console.twilio.com/)
- Railway project access
- An ops phone number that can receive a test SMS

**Steps:**
1. Open https://console.twilio.com/ → **Account** → **API keys & tokens**.
2. Under **Live credentials**, locate the **Auth Token** for the primary account.
3. Click **Request a secondary token** (Twilio's dual-token feature). Twilio now serves both tokens — old keeps working, new is active.
4. Copy the new token. Save to password manager under `gravel/twilio/auth-token`.
5. In Railway production env, update `TWILIO_AUTH_TOKEN` with the new value. Deploy.
6. After verification (next step), return to Twilio console and **promote** the secondary token (which retires the primary).

**Verification:**
```bash
pnpm --filter api ts-node scripts/test-twilio.ts +225XXXXXXXX
# expected: Twilio returns message SID (SMxxxxxxxxxxxxxx) and a test SMS arrives on +225XXXXXXXX
```

**Rollback:** If the deploy breaks SMS dispatch, revert `TWILIO_AUTH_TOKEN` in Railway to the original (still valid until promote). Redeploy. Do NOT promote in Twilio until verified.

---

### 4.5 DB password — Supabase Postgres (`DATABASE_URL` password segment)

**Cadence:** 90 days
**Owner:** SRE on-call
**Prerequisites:**
- Supabase dashboard access (project `qrkfkfhzavqjorhrlluj`)
- Railway project access
- **Maintenance window** — atomic rotation requires a brief API restart (≤2 min)

**Steps:**

This is the secret family already covered end-to-end by **`scripts/rotation-and-purge/ROTATION-CHECKLIST.md`**. **Follow that checklist for the DB password rotation** — sections "Step 2 — Rotate Postgres password", "Step 3 — Update Railway production env vars", "Step 4 — Verify the API still works". The procedure has been validated against production and includes the exact Supabase dashboard navigation, Railway env update sequence, and verification curl.

Do not duplicate it here (per D-13).

**Verification (summary):**
```bash
pnpm --filter api typeorm query "SELECT 1"
# expected: returns [{ "?column?": 1 }]
```

**Rollback:** If the API fails to connect after Railway redeploys, the Supabase rotation cannot be reversed — Supabase only stores the latest password. Recovery path: rotate again in Supabase to a *third* password, immediately update Railway, redeploy. Document the incident in `.planning/drills/rotations-2026.md`.

---

### 4.6 AWS S3 access keys (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)

**Cadence:** 180 days
**Owner:** SRE on-call
**Prerequisites:**
- AWS IAM console access for the `gravel-prod` account
- Railway project access
- Knowledge of the IAM user backing the API uploads (default: `gravel-api-hse-uploader`)

**Steps:**
1. Open AWS Console → **IAM** → **Users** → select `gravel-api-hse-uploader` (or the equivalent user for this env) → **Security credentials** tab.
2. Under **Access keys**, click **Create access key**. Use case: "Application running outside AWS". Confirm.
3. Copy both `Access key ID` and `Secret access key`. Save to password manager under `gravel/aws/s3-uploader`.
4. In Railway production env, update both:
   - `AWS_ACCESS_KEY_ID` = new key ID
   - `AWS_SECRET_ACCESS_KEY` = new secret
   Click **Deploy**. Wait for healthy deploy.
5. Verify (next step).
6. **Wait 24h** — leaves the old key active in case any in-flight signed URLs or async jobs still hold the previous credentials.
7. After 24h, return to AWS IAM → same user → **Access keys** → mark old key **Inactive** → wait another 24h → **Delete** old key.

**Verification:**
```bash
# From a shell with the new env loaded
AWS_ACCESS_KEY_ID=$NEW_ID AWS_SECRET_ACCESS_KEY=$NEW_SECRET aws s3 ls "s3://$S3_HSE_BUCKET"
# expected: lists existing HSE attachment objects (no AccessDenied)
```

Also verify through the running API:
```bash
# Trigger an HSE attachment upload via the test endpoint or QA script
pnpm --filter api ts-node scripts/test-s3-upload.ts
# expected: presigned URL returned + uploaded object visible in S3 console
```

**Rollback:** If Step 4 deploy breaks uploads, restore the previous `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` in Railway (the old key is still Active per step 7). Redeploy. Investigate before retry (common causes: IAM policy missing `s3:PutObject` on the new key's user, bucket name typo, region mismatch).

---

## 5. Post-rotation: git history purge

If the rotated secret was ever committed to a tracked file (any version of `apps/api/.env.example` with a real value, any seed script, any test fixture), the leaked value remains recoverable via `git log -p` on every clone. After a successful rotation and verification, purge the value from history:

```bash
bash scripts/rotation-and-purge/purge-secrets-from-history.sh
```

> **Only run after all collaborators are notified and rotation is verified.** The script force-rewrites `main`'s history; existing clones must re-clone. See `scripts/rotation-and-purge/ROTATION-CHECKLIST.md` sections 5–7 for the full purge / force-push / notification procedure.

Do NOT duplicate the script logic here — `scripts/rotation-and-purge/purge-secrets-from-history.sh` is the single source of truth.

---

## 6. Audit log

Every rotation event — scheduled or incident-driven — appends one row to the per-year rotation log:

```
.planning/drills/rotations-{YYYY}.md
```

Format (same shell as the backup drill log per D-07):

| Date (UTC) | Secret | Operator | Cadence due | Verification result | Notes |
|------------|--------|----------|-------------|---------------------|-------|
| 2026-05-17 | JWT signing key | ops@gravel | next: 2027-05-17 | ok | dual-key window 24h respected |

Append in the same PR that performs the rotation env update. The log is the audit trail surfaced to auditors and the client CISO.

---

## 7. References

- **D-11, D-12, D-13** — `.planning/phases/06-hardening-scale-multi-country-rollout/06-CONTEXT.md`
- **Original Supabase rotation procedure** — `scripts/rotation-and-purge/ROTATION-CHECKLIST.md`
- **History purge script** — `scripts/rotation-and-purge/purge-secrets-from-history.sh`
- **Canonical secret inventory** — `apps/api/.env.example`
- **Tech stack constraints** — `CLAUDE.md` (Keycloak 26, AWS S3, Brevo, Twilio)
- **Audit master** — `.planning/audits/v1.0-v1.1/AUDIT-MASTER.md` (P0-1, P0-2 closure references)
