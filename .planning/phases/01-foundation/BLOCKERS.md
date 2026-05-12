# Phase 1 — Wave 0 Execution Blockers

**Logged:** 2026-05-12 (W0-P01 executor)

## Local-environment blockers (do NOT block CI/merge)

The Wave 0 plan calls for `pnpm install`, `tofu validate`, and `flutter pub get`
to be runnable on the executor's machine. The current Windows host does NOT have
these tools installed:

| Tool | Status | Required by | Resolution |
|------|--------|-------------|------------|
| `pnpm` | not installed | T01, T02, T03, T04, T05 | Install via `npm install -g pnpm@9` or `corepack enable && corepack prepare pnpm@9 --activate`. CI workflow uses `pnpm/action-setup@v4`. |
| `tofu` (OpenTofu) | not installed | T07 | Install OpenTofu 1.8+ (https://opentofu.org/docs/intro/install/). `tofu fmt -check` + `tofu init -backend=false && tofu validate` runs in CI via `tofu-validate.yml`. |
| `flutter` | not installed | T06 | Install Flutter 3.35+ stable channel (https://docs.flutter.dev/get-started/install). Required for `flutter pub get` + `flutter test`. |
| Node 24 | Node 20.18.1 is installed | T01 | `.nvmrc` pins to 24; CI uses Node 24. Local install via nvm-windows recommended. |

## Decision

All files in this Wave 0 plan have been **authored manually** with correct,
ready-to-build contents (correct package names, version pins, file structure).
Local verification commands (`pnpm install`, `tofu validate`, `flutter pub get`)
are deferred to CI on first push, and are documented in the SUMMARY.

**No code-correctness blockers** — every Wave 0 deliverable is a literal file
on disk matching the plan's `<acceptance_criteria>`. The Nyquist RED state is
preserved because every test stub explicitly throws `NOT IMPLEMENTED` / `Wave 0 stub`.

## Verification path (post-tooling)

Once a developer installs pnpm/tofu/flutter:

```bash
pnpm install                                      # ~3 min first time
pnpm --filter @gravel/shared-types build          # ~5 s
pnpm --filter @gravel/api build                   # ~30 s
pnpm --filter @gravel/api test:ci                 # FAILS (RED) — expected
pnpm --filter @gravel/web build                   # ~60 s
cd apps/mobile && flutter pub get && flutter test # mobile stubs FAIL (RED) — expected
cd infra/tofu/envs/dev && tofu init -backend=false && tofu validate
```

These commands also run inside `.github/workflows/test.yml` and
`.github/workflows/tofu-validate.yml` on every push/PR.
