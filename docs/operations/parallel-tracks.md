# Parallel Tracks Register

**Created:** 2026-05-12
**Owner:** Project Lead
**Policy:** *User decision 2026-05-12: prérequis humains = pistes parallèles, jamais bloquants.*

Operational prerequisites that require humans (workshops, procurement, legal) are tracked here as **non-blocking parallel tracks**. Code progresses on documented provisional decisions; track outputs generate PR adjustments later — never a rewrite.

## Active tracks

| Track | Status | Owner | Due | Blocks code? | Notes |
|-------|--------|-------|-----|--------------|-------|
| co-design-workshop | scheduled | TBD | TBD | NO | Refine wireframes — generates PR adjustments later. Baseline lives in `docs/design/phase-02/provisional-wireframes.md`. Code marks unsure ergonomics with `// TODO(co-design): valider en atelier`. |
| device-procurement | scheduled | TBD | TBD | NO | Samsung XCover Pro 6 (phone rugged) + Samsung Galaxy Tab Active 3 (tablette rugged 8") quantities — code targets Android 11+ minimum spec until then. Test today on emulator Pixel 6 Android 13 + Pixel Tablet. |
| aggrid-license-decision | n/a | n/a | n/a | NO | Phase 2 uses **AG Grid Community** only (OSS Apache-2.0). Enterprise not on roadmap. Pivots/group rows replaced with native Material/Angular CDK tables if needed. *User decision 2026-05-12: outils gratuits/OSS uniquement.* |
| s3-object-lock-mode-legal-review | scheduled | TBD | TBD | NO | Object Lock applied in **Governance** mode by default (override by root account possible). Compliance mode pending legal review (see `legal-review-queue.md`). |
| keycloak-realm-import-phase02-roles | scheduled | DevOps | TBD | NO | `infra/keycloak/realms/gravel/roles/phase-02.json` ready to import via `kcadm.sh` or `terraform-provider-keycloak`. Tests use mock JWTs with role claims directly. |
| hse-severity-scale-calibration | scheduled | HSE Officer + Legal CI | TBD | NO | Default 1–5 scale per D2-60. Legal calibration may shift thresholds for `severity ≥ 4 closure block`. Code uses the default; ADR-0008 to be updated when ratified. |
| workforce-headcount-collection | scheduled | Site Manager | Daily (operational) | NO | Manual entry on OperationalDay close form. Replaced by HR pointage in Phase 3. |

## How to add a new track

Append a row. Required columns:
- **Track** — kebab-case identifier
- **Status** — `scheduled` / `in_progress` / `done` / `n/a`
- **Owner** — person or role
- **Due** — target date or `TBD`
- **Blocks code?** — must be `NO` for an item to live here; `YES` items live in `STATE.md` Blockers
- **Notes** — links, decisions, mitigation while pending

## Closure

When a track delivers, do **not** delete the row — mark it `done` and link the resulting PR(s). This preserves the history of what was provisional and what was confirmed.

---

*Plan 02-W0-P01 Task 1 — Wave 0 foundations*
