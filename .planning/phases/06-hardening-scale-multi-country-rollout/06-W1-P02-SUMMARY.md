---
phase: 06-hardening-scale-multi-country-rollout
plan: W1-P02
subsystem: cutover-runbook
tags: [hardening, cutover, runbook, master-data, keycloak, ohada]
requirements: [HRD-MVP-08]
dependency-graph:
  requires: []
  provides:
    - first-customer-cutover-playbook
    - master-data-csv-templates
    - keycloak-bulk-provisioning-procedure
  affects:
    - HRD-MVP-01..07 (referenced as pre-flight gates)
    - first-paying-customer-onboarding
tech-stack:
  added: []
  patterns:
    - per-tenant runbook clone (copy-and-tick model)
    - phase-gated cutover (T-7d / T-1d / T-0 / T+0 / day-1/7/30)
    - master-data-only data load (no transactional history)
    - Keycloak Admin API bulk user provisioning
key-files:
  created:
    - .planning/runbooks/v1.1-cutover.md
    - .planning/runbooks/cutover-templates/master-data-sites.csv
    - .planning/runbooks/cutover-templates/master-data-users.csv
    - .planning/runbooks/cutover-templates/master-data-equipment.csv
    - .planning/runbooks/cutover-templates/master-data-suppliers.csv
  modified: []
decisions:
  - D-23 honored: 7 explicit phase gates (T-7d pre-flight, T-1d provisioning, T-0 data load, T+0 training, day-1/7/30 review) each with sign-off artifact
  - D-24 honored: master-data only (4 CSV templates — sites/users/equipment/suppliers); §5.5 explicitly enumerates NOT-migrated transactional history
  - D-25 honored: Keycloak Admin API bulk provisioning script invocation + FR primary / EN secondary training tracks (no local-language sessions per i18n FR/EN/AR scope)
  - XOF currency defaulted in CSV templates per OHADA/BCEAO constraint (CLAUDE.md)
  - Per-tenant runbook copy pattern (`.planning/cutovers/{customer-slug}-{YYYYMMDD}.md`) so the runbook itself becomes the per-customer audit artifact
metrics:
  duration: ~10 min
  completed: 2026-05-17
  tasks: 2
  files: 5
---

# Phase 6 Plan W1-P02: HRD-MVP-08 Production Cutover Runbook Summary

Canonical cutover playbook (`v1.1-cutover.md`) plus 4 master-data CSV templates that take Gravel Ivoire's first paying Côte d'Ivoire customer from contract-signed through day-30 review using a single document and a self-explanatory data-handoff package.

## What Was Built

### Cutover runbook (`.planning/runbooks/v1.1-cutover.md`, ~380 lines)

11 sections, all keyed to the D-23/D-24/D-25 decisions:

1. **Purpose & DRI** — delivery engineer owns; per-tenant copy-and-tick pattern (`cutovers/{customer-slug}-{YYYYMMDD}.md`)
2. **Cutover phase gates table** — 7 phases × owner × sign-off artifact
3. **T-7d pre-flight** — 10 checkboxes cross-linking HRD-MVP-01..07 pre-requisites + CSV-templates-delivered + training-scheduled gates
4. **T-1d provisioning** — concrete SQL for `tenant` row, Keycloak Admin API curl commands for group + 6 default roles, S3 prefix creation, 5-point smoke test
5. **T-0 data load (D-24)** — 4 import command invocations (FK-safe order: sites → suppliers → equipment → users), §5.5 explicitly lists what is NOT migrated (work orders, BLs, incidents, fuel logs, analytics, legacy audit)
6. **T+0 training (D-25)** — FR 2h mandatory + EN 1h optional sessions; explicit i18n FR/EN/AR scope; sign-off attendance sheet
7. **Day-1 review** — login completion, mobile sync, P0/P1 quiet, one E2E weighing/BL flow
8. **Day-7 review** — DAU > 60%, cost-per-ton populated for all sites
9. **Day-30 review** — DAU > 75%, first audit export delivered, first SLO report, churn-risk scoring (green/yellow/red)
10. **Rollback plan** — RLS-scoped DELETE order, Keycloak group disable, 2-hour budget
11. **References** — sibling HRD-MVP plans, decisions, prod URLs (gravel-erp-web-sigma.vercel.app, Supabase ref qrkfkfhzavqjorhrlluj), ADRs

### Master-data CSV templates (D-24 scope — 4 files)

Each file: header row + 1 plausible CI example row + `#` comment row documenting every column constraint.

| File | Columns | Notable constraints |
| --- | --- | --- |
| `master-data-sites.csv` | code, name, country_iso2, timezone, lat, lng, operational_since, billing_currency, locale_primary | UEMOA timezones, ISO 4217 currency (XOF default), BCP 47 locale |
| `master-data-users.csv` | email, first_name, last_name, role_code, site_code, phone_e164, locale, active | 6 role_codes enumerated; site_code is FK; E.164 phone; FR/EN/AR locale only |
| `master-data-equipment.csv` | asset_tag, site_code, category, manufacturer, model, year, fuel_type, initial_hours, initial_km, active | 9 categories; initial_hours/km feed PM scheduler |
| `master-data-suppliers.csv` | code, name, country_iso2, supplier_type, contact_email, phone_e164, payment_terms_days, currency, active | 7 supplier_types; multi-currency support for international suppliers |

## Decisions Made

- **Per-tenant runbook clone pattern.** The runbook itself is copied to `.planning/cutovers/{customer}/...md` per customer and ticked in place. The completed file is the audit artifact — no separate sign-off log to maintain.
- **FK-safe import order encoded in the runbook.** sites → suppliers → equipment → users. Equipment and users both reference site_code, so sites must land first.
- **Single Keycloak realm for v1.1.** `gravel-prod` with one group per tenant. Per-country realms are explicitly deferred to Phase 6B / v2 per the context decisions matrix.
- **CSV templates use `#` comment lines** (not separate README) so the column constraints travel with the file when the customer's IT admin opens it in Excel/LibreOffice. Many CSV importers including the planned `import-csv.ts` script skip `#`-prefixed lines.
- **OHADA / XOF defaults baked in.** Example rows and column docs default to XOF (BCEAO / UEMOA — CI/BF/ML/SN). EUR/USD called out for international supplier rows.
- **i18n scope respected.** Training is FR + EN only. No Dioula/Baoulé sessions per `feedback_i18n_scope`. AR called out as optional locale value for future Sahel/North-Africa expansion.

## Deviations from Plan

None — plan executed exactly as written. Both tasks shipped with the file paths, headers, and acceptance criteria the plan specified. No bug fixes (Rule 1), no missing critical functionality (Rule 2), no blocking issues (Rule 3), no architectural questions (Rule 4) raised.

## Known Stubs

None — these are documentation artifacts (runbook + CSV templates), not runtime code wired to UI. The runbook references two scripts that do not yet exist in the repo:

- `scripts/import-csv.ts` — referenced as the master-data importer
- `scripts/keycloak-bulk-provision.ts` — referenced as the Keycloak Admin API bulk provisioning script

These are intentionally out of scope for HRD-MVP-08 (which produces the *runbook*, not the *tooling*). They will be needed before an actual first-customer cutover and should be tracked as a follow-up (likely a sibling W1 task or the v1.1 cutover-execution plan).

Two paths referenced as cross-links also do not exist yet:

- `.planning/runbooks/dr-playbook.md` — produced by HRD-MVP-03 (sibling)
- `.planning/training/v1.1/` — training materials folder, called out in §6.3 with a TODO

These belong to sibling plans and will be created by their owners.

## Verification

- `test -f .planning/runbooks/v1.1-cutover.md` ✅
- `grep -q "T-7d pre-flight" ...` ✅
- `grep -q "T-1d Provisioning" ...` ✅
- `grep -q "T-0" ...` ✅
- `grep -qi "day-1|day-7|day-30" ...` ✅ (all three present)
- `grep -q "Keycloak Admin API" ...` ✅
- `grep -q "master-data-sites.csv" ...` ✅
- All 4 CSV files exist with correct headers ✅
- D-24 enforced: §5.5 enumerates the NOT-migrated list ✅

## Commits

| Task | Hash | Message |
| --- | --- | --- |
| 1 | `2a0ff54` | `docs(06-W1-P02): add v1.1 production cutover runbook (HRD-MVP-08)` |
| 2 | `9a747a3` | `docs(06-W1-P02): add 4 master-data CSV templates for cutover` |

## Self-Check: PASSED

Files verified on disk:
- FOUND: `.planning/runbooks/v1.1-cutover.md`
- FOUND: `.planning/runbooks/cutover-templates/master-data-sites.csv`
- FOUND: `.planning/runbooks/cutover-templates/master-data-users.csv`
- FOUND: `.planning/runbooks/cutover-templates/master-data-equipment.csv`
- FOUND: `.planning/runbooks/cutover-templates/master-data-suppliers.csv`

Commits verified in `git log`:
- FOUND: `2a0ff54`
- FOUND: `9a747a3`
