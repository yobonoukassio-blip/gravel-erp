# Rotation & History Purge — Checklist

**Why this exists:** the v1.0-v1.1 security audit (`.planning/audits/v1.0-v1.1/SECURITY-AUDIT.md`) identified two leaked secrets in git history:

- `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY` in `apps/api/.env.example` (every commit until the sanitization in `bd53f9e`)
- Postgres password `Waliyatb123` in `apps/api/seed_alert_rules.mjs` (introduced in commit `6194c12`, sanitized in `bd53f9e`)

Both are still recoverable by anyone with read access to the repo via `git log -p` or by cloning and `git filter-repo --analyze`. **The fix is a two-step ordered operation: ROTATE → PURGE.**

---

## ⚠️ ORDER MATTERS

Do NOT purge history before rotating. The window between purge and rotation is when an attacker who already cloned the repo finalizes their exfiltration — the very act of force-pushing signals "we noticed" and accelerates abuse.

**Correct order:**

1. ✅ Rotate Supabase SERVICE_ROLE_KEY (old key becomes useless)
2. ✅ Rotate Postgres password (old password becomes useless)
3. ✅ Update Railway env vars with new key + new password
4. ✅ Verify API still works against new credentials
5. ✅ THEN purge git history
6. ✅ Force-push to main
7. ✅ Notify any collaborator to re-clone

---

## Step 1 — Rotate Supabase SERVICE_ROLE_KEY

1. Open https://supabase.com/dashboard/project/qrkfkfhzavqjorhrlluj/settings/api
2. Locate "Service Role Key" (the `service_role` key, NOT the `anon` key)
3. Click "Reset service_role secret" (or similar wording)
4. Confirm the rotation
5. **Copy the new key** — you only see it once
6. Save it temporarily in your password manager (not in any file)

**Also rotate the ANON key while you're there** — it leaked too, even if less dangerous:

7. Click "Reset anon key" (or similar)
8. Copy the new anon key

---

## Step 2 — Rotate Postgres password

1. Same Supabase dashboard → **Project Settings → Database**
2. Click "Reset database password"
3. Generate or pick a new strong password (32+ chars, mixed)
4. Save it temporarily in your password manager
5. Note the new `postgresql://...` connection string Supabase shows after reset

---

## Step 3 — Update Railway production env vars

1. Open https://railway.com/project/<your-project-id>
2. Select the API service (NestJS)
3. Settings → Variables
4. Update:
   - `DATABASE_URL` — paste the new connection string from Supabase (with the new password)
   - `SUPABASE_SERVICE_ROLE_KEY` — paste the new key
   - `SUPABASE_ANON_KEY` — paste the new anon key (if you rotated it)
5. Click "Deploy" (Railway redeploys with new env)
6. Wait for the deploy to be healthy (logs show "API listening")

---

## Step 4 — Verify the API still works

```bash
# From your local machine
curl https://<your-railway-domain>/health/live
# expected: 200 OK
```

If 200, the new credentials are in effect. If 5xx, check Railway logs — likely a typo in the env var.

---

## Step 5 — Purge git history

Once the API is happily running with the new credentials, the OLD secrets in git history are useless to an attacker. You can now purge them safely.

Use the prepared script:

```bash
bash scripts/rotation-and-purge/purge-secrets-from-history.sh
```

The script uses `git filter-repo` (recommended over the deprecated `git filter-branch`). If you don't have it:

- **Linux/Mac:** `pip install git-filter-repo`
- **Windows:** `pip install git-filter-repo` (Python required), or download the single-file script from https://github.com/newren/git-filter-repo

The script will:
1. Verify you're on `main`, working tree clean, branch up-to-date
2. Create a `pre-purge-backup` branch (safety net)
3. Run `git filter-repo --replace-text` to scrub the known leaked strings
4. Show you the diff stat

---

## Step 6 — Force-push

```bash
# Read the diff stat above. If it looks right:
git push --force-with-lease origin main
```

`--force-with-lease` is safer than `--force`: it fails if someone else pushed since you last fetched, avoiding overwriting their work.

---

## Step 7 — Notify collaborators

If anyone else has a clone of the repo:

> Subject: [URGENT] Re-clone gravel — git history rewritten
>
> We rewrote main's history to remove leaked Supabase credentials. Your existing clone has the old history and will reject pulls. Please:
>
> 1. Save any uncommitted local work elsewhere
> 2. `rm -rf` your clone (or rename it)
> 3. `git clone` fresh from origin
> 4. Reapply any local work on a new branch
>
> Sorry for the churn — necessary for security hygiene.

---

## After completion — update audit master

Mark P0-1 and P0-2 as `[x] done` in `.planning/audits/v1.0-v1.1/AUDIT-MASTER.md`. Tag the resolution commit `chore(security): rotated all leaked credentials + purged git history (audit P0-1, P0-2)`.

---

_Checklist generated: 2026-05-16. Audit ref: SECURITY-AUDIT.md FINDING-001, FINDING-002._
