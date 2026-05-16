#!/usr/bin/env bash
# purge-secrets-from-history.sh — scrub leaked credentials from git history.
#
# Audit ref: .planning/audits/v1.0-v1.1/SECURITY-AUDIT.md FINDING-001, FINDING-002
#
# Prerequisites (run in this order — DO NOT skip):
#   1. Rotated Supabase SERVICE_ROLE_KEY on the dashboard
#   2. Rotated Supabase ANON_KEY (optional but recommended)
#   3. Rotated Postgres password
#   4. Updated Railway env vars with new values
#   5. Verified API still works (curl /health/live)
#
# Effect:
#   - Replaces the known leaked strings with `***REDACTED***` in EVERY commit.
#   - Creates a backup branch `pre-purge-backup` so you can recover.
#   - Does NOT push. You must `git push --force-with-lease origin main` after.
#
# Why filter-repo not filter-branch:
#   git-filter-branch is deprecated, slow, and dangerous. filter-repo is the
#   recommended replacement (https://github.com/newren/git-filter-repo).

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

echo "=== Pre-flight checks ==="

# 1. On main
current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$current_branch" != "main" ]; then
  echo "ERROR: expected to be on 'main', currently on '$current_branch'." >&2
  echo "Run: git checkout main" >&2
  exit 1
fi

# 2. Working tree clean
if ! git diff-index --quiet HEAD --; then
  echo "ERROR: working tree has uncommitted changes." >&2
  echo "Commit or stash before running." >&2
  exit 1
fi

# 3. git-filter-repo present
if ! command -v git-filter-repo >/dev/null 2>&1; then
  echo "ERROR: git-filter-repo not installed." >&2
  echo "Install: pip install git-filter-repo" >&2
  echo "Or download: https://github.com/newren/git-filter-repo" >&2
  exit 1
fi

# 4. Up-to-date with origin
git fetch origin main
local_sha="$(git rev-parse main)"
remote_sha="$(git rev-parse origin/main)"
if [ "$local_sha" != "$remote_sha" ]; then
  echo "ERROR: local main diverges from origin/main." >&2
  echo "  local:  $local_sha" >&2
  echo "  remote: $remote_sha" >&2
  echo "Sync first: git pull --rebase origin main" >&2
  exit 1
fi

# 5. Confirmation gate
echo
echo "About to rewrite EVERY commit on 'main' to scrub leaked credentials."
echo "This is irreversible without the backup branch (which will be created)."
echo
read -rp "Have you ROTATED all credentials on Supabase + Railway? (type 'yes-rotated'): " confirm
if [ "$confirm" != "yes-rotated" ]; then
  echo "Aborted. Rotate first; see ROTATION-CHECKLIST.md." >&2
  exit 1
fi

echo
echo "=== Creating backup branch ==="
git branch -f pre-purge-backup main
echo "Backup branch: pre-purge-backup (will not be pushed)"

echo
echo "=== Building replacement list ==="
# Strings literally present in repo history that must be scrubbed.
# Add more lines if you discover additional leaks.
tmp_replace="$(mktemp)"
cat > "$tmp_replace" <<'REPLACE_EOF'
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFya2ZrZmh6YXZxam9yaHJsbHVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MjE1OTgsImV4cCI6MjA5NDE5NzU5OH0.mDNeXSAg8_lFjbJSy0O3exguQXMSQ-jCtECONGu5a7w==>***REDACTED_OLD_ANON_KEY***
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFya2ZrZmh6YXZxam9yaHJsbHVqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODYyMTU5OCwiZXhwIjoyMDk0MTk3NTk4fQ.PO_owUou_TQpYm5NpuDn7Buz5_lGcT4tKeei8aTfghk==>***REDACTED_OLD_SERVICE_ROLE_KEY***
Waliyatb123==>***REDACTED_OLD_DB_PASSWORD***
REPLACE_EOF

echo "Patterns to scrub:"
sed 's/==>.*$//' "$tmp_replace" | sed 's/^/  - /'

echo
echo "=== Running git filter-repo ==="
git filter-repo --replace-text "$tmp_replace" --force

rm -f "$tmp_replace"

echo
echo "=== Post-rewrite stats ==="
echo "Backup branch:  pre-purge-backup ($(git rev-parse pre-purge-backup))"
echo "New main HEAD:  $(git rev-parse main)"
echo

# filter-repo removes the remote — re-add it.
if ! git remote get-url origin >/dev/null 2>&1; then
  echo "Re-adding origin remote..."
  read -rp "Origin URL (e.g. git@github.com:user/gravel.git): " origin_url
  git remote add origin "$origin_url"
fi

echo
echo "=== DONE — review then push ==="
echo
echo "Verify the scrub worked:"
echo "  git log -p -S 'Waliyatb123' --all | head"
echo "  git log -p -S 'PO_owUou' --all | head    # service role token chunk"
echo "Both should output NOTHING."
echo
echo "When happy:"
echo "  git push --force-with-lease origin main"
echo
echo "Then notify collaborators to re-clone."
