---
phase: 06-hardening-scale-multi-country-rollout
plan: W1-P02
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/runbooks/v1.1-cutover.md
  - .planning/runbooks/cutover-templates/master-data-sites.csv
  - .planning/runbooks/cutover-templates/master-data-users.csv
  - .planning/runbooks/cutover-templates/master-data-equipment.csv
  - .planning/runbooks/cutover-templates/master-data-suppliers.csv
autonomous: true
requirements: [HRD-MVP-08]
requirements_covered: [HRD-MVP-08]
must_haves:
  truths:
    - "A delivery engineer can take the first paying customer from contract-signed to day-30-review using a single canonical runbook."
    - "Customer's IT admin can populate 4 CSV templates (sites, users, equipment, suppliers) and hand them back; no transactional history is migrated (D-24)."
    - "User provisioning is automated via Keycloak Admin API + bulk role-assignment script (D-25)."
    - "Pre-flight (T-7d), provisioning (T-1d), data load (T-0), training (T+0), and day-1/7/30 review gates are explicit checkboxes."
  artifacts:
    - path: ".planning/runbooks/v1.1-cutover.md"
      provides: "First-customer cutover checklist with all phase gates and templates"
      contains: "T-7d pre-flight"
      contains_all:
        - "T-7d pre-flight"
        - "T-1d provisioning"
        - "T-0 data load"
        - "T+0 training"
        - "day-1 review"
        - "day-7 review"
        - "day-30 review"
        - "master-data-sites.csv"
        - "Keycloak Admin API"
    - path: ".planning/runbooks/cutover-templates/master-data-sites.csv"
      provides: "CSV template for site master data import"
    - path: ".planning/runbooks/cutover-templates/master-data-users.csv"
      provides: "CSV template for user provisioning import"
    - path: ".planning/runbooks/cutover-templates/master-data-equipment.csv"
      provides: "CSV template for equipment master data import"
    - path: ".planning/runbooks/cutover-templates/master-data-suppliers.csv"
      provides: "CSV template for suppliers master data import"
  key_links:
    - from: ".planning/runbooks/v1.1-cutover.md"
      to: ".planning/runbooks/cutover-templates/"
      via: "explicit links to all 4 CSV templates"
      pattern: "cutover-templates"
---

<objective>
Produce the canonical Production Cutover Runbook (HRD-MVP-08) — the playbook a delivery engineer uses to take Gravel Ivoire's first paying customer (Côte d'Ivoire) from contract-signed to operational and reviewed at day-30, per D-23/D-24/D-25.

Purpose: Without this runbook, first-customer onboarding becomes improvised tribal knowledge — fatal for repeatable client wins. The runbook captures: pre-flight checks, environment provisioning, master-data load (no transactional history per D-24), user provisioning via Keycloak Admin API (D-25), training materials in FR+EN, and the day-1/day-7/day-30 review cadence. CSV templates make the data-handoff to the customer's IT admin concrete.

Output: `.planning/runbooks/v1.1-cutover.md` + 4 CSV templates under `.planning/runbooks/cutover-templates/`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/phases/06-hardening-scale-multi-country-rollout/06-CONTEXT.md
@CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Author v1.1-cutover.md with all phase gates and review cadence</name>
  <files>.planning/runbooks/v1.1-cutover.md</files>
  <read_first>
    - .planning/phases/06-hardening-scale-multi-country-rollout/06-CONTEXT.md (decisions D-23, D-24, D-25)
    - CLAUDE.md (Keycloak realms, Supabase prod URLs, Vercel/Railway deploy targets)
    - .planning/STATE.md (current stack + URLs in MEMORY: prod web = gravel-erp-web-sigma.vercel.app)
  </read_first>
  <action>
Create `.planning/runbooks/v1.1-cutover.md` with the following structure:

## 1. Purpose & DRI
- Delivery engineer (DRI) owns execution
- Customer Success cross-checks day-1/7/30 reviews
- Runbook is per-tenant: copy this file to `.planning/cutovers/{customer-slug}-{YYYYMMDD}.md` and check off in place

## 2. Cutover Phase Gates (high-level table)

| Phase | Gate | Owner | Sign-off artifact |
|-------|------|-------|-------------------|
| T-7d pre-flight | All checklist items green | Delivery + SRE | This document marked ✅ |
| T-1d provisioning | Tenant row + Keycloak realm group + S3 prefix exist | SRE | Provisioning log |
| T-0 data load | All 4 CSVs imported, row counts match expected | Delivery | Import diff report |
| T+0 training | Both FR + EN sessions delivered | Customer Success | Signed attendance sheet |
| Day-1 review | Smoke tests + KPI baseline | Delivery + Customer | Day-1 minute |
| Day-7 review | First week metrics + incident log | Customer Success | Day-7 minute |
| Day-30 review | Adoption KPIs + churn-risk scoring | Customer Success | Day-30 minute |

## 3. T-7d Pre-flight checklist (concrete items, all checkboxes)

- [ ] Customer contract countersigned (file ref)
- [ ] Compliance contact email captured for audit export (links to HRD-MVP-05)
- [ ] DR runbook current revision linked (HRD-MVP-03)
- [ ] Backup drill within last 30d (HRD-MVP-02)
- [ ] Latest pen-test report has zero CRITICAL (HRD-MVP-01)
- [ ] SLO dashboards green for last 14d (HRD-MVP-06)
- [ ] All secrets within rotation cadence (HRD-MVP-04)
- [ ] Mobile + sync chaos run passed in last 30d (HRD-MVP-07)
- [ ] CSV templates delivered to customer IT admin (link to ./cutover-templates/)
- [ ] Customer training schedule confirmed (FR session date, EN session date)

## 4. T-1d Provisioning (concrete commands)

### 4.1 Create tenant row
```sql
-- Run via Supabase SQL editor as service_role
INSERT INTO tenant (id, code, name, country, billing_email, compliance_email, locale_primary, locale_fallback)
VALUES (gen_random_uuid(), '{CUSTOMER_CODE}', '{Customer Name}', 'CI', '{billing@}', '{compliance@}', 'fr-CI', 'en');
```

### 4.2 Create Keycloak realm group + roles
- Endpoint: `POST $KEYCLOAK_URL/admin/realms/gravel-prod/groups` body `{ "name": "{CUSTOMER_CODE}" }`
- Then assign default roles: DIRECTEUR_SITE, CHEF_CARRIERE, MAINTENANCE_MANAGER, GESTIONNAIRE_STOCK, OPERATEUR, COMPLIANCE_OFFICER

### 4.3 Create S3 prefixes
- `aws s3api put-object --bucket $S3_HSE_BUCKET --key {CUSTOMER_CODE}/hse/.keep`
- `aws s3api put-object --bucket $S3_HSE_BUCKET --key {CUSTOMER_CODE}/audit-exports/.keep`

### 4.4 Smoke test
- `curl https://gravel-erp-web-sigma.vercel.app/health` returns 200
- `curl https://{api-domain}/health` returns 200
- Login with provisioned test user succeeds via Angular UI

## 5. T-0 Data Load (D-24 — master data ONLY, NO transactional history)

### 5.1 CSV templates (link to files)
- `./cutover-templates/master-data-sites.csv`
- `./cutover-templates/master-data-users.csv`
- `./cutover-templates/master-data-equipment.csv`
- `./cutover-templates/master-data-suppliers.csv`

### 5.2 Import commands
- `pnpm --filter api ts-node scripts/import-csv.ts --tenant {CUSTOMER_CODE} --file ./cutovers/{customer}/sites.csv --table site`
- Same pattern for users, equipment, suppliers (4 invocations)

### 5.3 Bulk user provisioning (D-25)
- Use Keycloak Admin API via `scripts/keycloak-bulk-provision.ts --csv ./cutovers/{customer}/users.csv --realm gravel-prod --group {CUSTOMER_CODE}`
- Each user receives a one-time temp password + email to set their own (Keycloak built-in flow)

### 5.4 Post-import verification
- `psql $DATABASE_URL -c "SELECT count(*) FROM site WHERE tenant_id = '{tenant_uuid}'"` matches CSV row count
- Same for user, equipment, supplier tables
- Spot-check: log in as one provisioned user from each role, verify dashboard renders

### 5.5 NO migration of:
Per D-24 — no transactional history (no historical work orders, no historical BLs, no historical incidents). Customer starts clean. Document this in customer-facing onboarding email.

## 6. T+0 Training (D-25 — FR primary + EN secondary)

- Session 1 (FR, 2h, mandatory): Onboarding, role-by-role walkthrough, mobile app install + first sync
- Session 2 (EN, 1h, optional for expat ops directors): Group dashboard, P&L drill-down, alert configuration
- Materials in `.planning/training/v1.1/` (separate folder; out of scope here — link as TODO if missing)

## 7. Day-1 Review (T+1d)

Checklist:
- [ ] All provisioned users logged in at least once
- [ ] First mobile sync successful from each site
- [ ] No P0/P1 incidents in Grafana Alerts (HRD-MVP-06)
- [ ] First BL/weighing-ticket created successfully (smoke production flow)

## 8. Day-7 Review (T+7d)

Checklist:
- [ ] Adoption metric: DAU / provisioned users > 60%
- [ ] Cost-per-ton dashboard shows non-zero values for all sites
- [ ] At least one alert fired and was acknowledged
- [ ] Incidents log + remediation items shared with customer

## 9. Day-30 Review (T+30d)

Checklist:
- [ ] DAU / provisioned users > 75%
- [ ] First monthly audit export generated and delivered (HRD-MVP-05)
- [ ] First SLO report delivered to customer (HRD-MVP-06)
- [ ] Churn-risk scoring: green / yellow / red — owner: Customer Success
- [ ] Lessons-learned captured in `.planning/cutovers/{customer-slug}-{YYYYMMDD}.md`

## 10. Rollback plan
If T-0 data load fails irrecoverably:
1. Truncate tenant rows: `DELETE FROM {table} WHERE tenant_id = '{uuid}'` for each master table
2. Disable Keycloak group temporarily
3. Re-run T-0 with corrected CSVs
4. Document root cause in cutover file

## 11. References
- D-23, D-24, D-25 in `06-CONTEXT.md`
- `cutover-templates/` (this directory)
- HRD-MVP-01..07 (sibling tracks)
  </action>
  <verify>
    <automated>test -f .planning/runbooks/v1.1-cutover.md && grep -q "T-7d pre-flight" .planning/runbooks/v1.1-cutover.md && grep -q "T-1d provisioning" .planning/runbooks/v1.1-cutover.md && grep -q "T-0" .planning/runbooks/v1.1-cutover.md && grep -q "day-1" .planning/runbooks/v1.1-cutover.md && grep -q "day-7" .planning/runbooks/v1.1-cutover.md && grep -q "day-30" .planning/runbooks/v1.1-cutover.md && grep -q "Keycloak Admin API" .planning/runbooks/v1.1-cutover.md && grep -q "master-data-sites.csv" .planning/runbooks/v1.1-cutover.md</automated>
  </verify>
  <acceptance_criteria>
    - File `.planning/runbooks/v1.1-cutover.md` exists
    - All 6 phase gates present (T-7d, T-1d, T-0, T+0, day-1, day-7, day-30)
    - D-24 explicitly stated: NO transactional history migration
    - D-25 covered: Keycloak Admin API bulk provisioning + FR/EN training
    - Cross-links to HRD-MVP-01..07 sibling plans
    - References all 4 CSV templates
  </acceptance_criteria>
  <done>A delivery engineer with no prior cutover experience can drive the first paying customer from contract-signed to day-30-review by following only this document.</done>
</task>

<task type="auto">
  <name>Task 2: Generate the 4 master-data CSV templates with headers + 1 example row each</name>
  <files>.planning/runbooks/cutover-templates/master-data-sites.csv, .planning/runbooks/cutover-templates/master-data-users.csv, .planning/runbooks/cutover-templates/master-data-equipment.csv, .planning/runbooks/cutover-templates/master-data-suppliers.csv</files>
  <read_first>
    - .planning/runbooks/v1.1-cutover.md (just-created — Task 1 output)
    - apps/api/src/modules/master-data/ (peek at entities to align CSV headers to actual DB columns — if module missing, infer from common ERP master-data shapes and add TODO in runbook)
  </read_first>
  <action>
Create the 4 CSV templates. Each must have a header row and exactly ONE example row commented in plain English at the bottom (using a `#` comment row marker — many ERP CSV importers skip lines starting with `#`).

### 1. master-data-sites.csv
```
code,name,country_iso2,timezone,lat,lng,operational_since,billing_currency,locale_primary
CI-ABJ-01,Carrière Abidjan Nord,CI,Africa/Abidjan,5.4567,-4.0234,2024-01-15,XOF,fr-CI
# code: unique short slug per site (uppercased); country_iso2: ISO 3166-1 alpha-2; timezone: IANA; lat/lng: decimal; billing_currency: ISO 4217 (XOF for CI/BF/ML/SN)
```

### 2. master-data-users.csv
```
email,first_name,last_name,role_code,site_code,phone_e164,locale,active
operateur1@customer.ci,Aya,Kouassi,OPERATEUR,CI-ABJ-01,+2250707070707,fr-CI,true
# role_code: one of DIRECTEUR_SITE|CHEF_CARRIERE|MAINTENANCE_MANAGER|GESTIONNAIRE_STOCK|OPERATEUR|COMPLIANCE_OFFICER; phone_e164 in +CC format; locale fr-CI or en
```

### 3. master-data-equipment.csv
```
asset_tag,site_code,category,manufacturer,model,year,fuel_type,initial_hours,initial_km,active
PELLE-001,CI-ABJ-01,EXCAVATOR,Caterpillar,336F,2023,DIESEL,1250,0,true
# category: EXCAVATOR|LOADER|DUMP_TRUCK|CRUSHER|SCREEN|DRILL|TRUCK_TRANSPORT; fuel_type: DIESEL|ELECTRIC|HYBRID; initial_hours/km: meter starting values for PM scheduler
```

### 4. master-data-suppliers.csv
```
code,name,country_iso2,supplier_type,contact_email,phone_e164,payment_terms_days,currency,active
SUP-FUEL-001,TotalEnergies CI,CI,FUEL,procurement@totalenergies.ci,+2252021000000,30,XOF,true
# supplier_type: FUEL|EXPLOSIVES|SPARE_PARTS|CONSUMABLES|SERVICES; payment_terms_days: integer; currency: ISO 4217
```

All files use Unix LF line endings, UTF-8 (no BOM).
  </action>
  <verify>
    <automated>test -f .planning/runbooks/cutover-templates/master-data-sites.csv && test -f .planning/runbooks/cutover-templates/master-data-users.csv && test -f .planning/runbooks/cutover-templates/master-data-equipment.csv && test -f .planning/runbooks/cutover-templates/master-data-suppliers.csv && head -1 .planning/runbooks/cutover-templates/master-data-sites.csv | grep -q "code,name,country_iso2" && head -1 .planning/runbooks/cutover-templates/master-data-users.csv | grep -q "email,first_name" && head -1 .planning/runbooks/cutover-templates/master-data-equipment.csv | grep -q "asset_tag,site_code" && head -1 .planning/runbooks/cutover-templates/master-data-suppliers.csv | grep -q "code,name,country_iso2"</automated>
  </verify>
  <acceptance_criteria>
    - All 4 CSV files exist with correct headers
    - Each has 1 plausible example row using CI (Côte d'Ivoire) data
    - Each has a `#` comment row explaining each column's constraint
    - XOF used as default currency for CI (matches OHADA / BCEAO per CLAUDE.md)
  </acceptance_criteria>
  <done>The customer's IT admin receives 4 self-explanatory CSV templates and can populate them without further clarification from Gravel.</done>
</task>

</tasks>

<verification>
- `.planning/runbooks/v1.1-cutover.md` exists with all 6 phase gates and review cadence.
- 4 CSV templates exist under `.planning/runbooks/cutover-templates/`.
- D-23, D-24, D-25 all addressed.
</verification>

<success_criteria>
HRD-MVP-08 satisfied: a delivery engineer has the complete cutover playbook for the first paying customer plus the data-handoff templates needed to onboard them in a single sprint.
</success_criteria>

<output>
After completion, create `.planning/phases/06-hardening-scale-multi-country-rollout/06-W1-P02-SUMMARY.md`.
</output>
