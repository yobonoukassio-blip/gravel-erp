# Phase 6 — Hardening & Multi-Country Rollout Runbook

**Status:** v2 scope. This runbook captures the operational checklists, ownership matrix, and acceptance criteria. Implementation is gated on (a) pilot site reaching steady state and (b) the second-country expansion decision.

**Owner:** TBD (CTO + SRE lead)
**Last reviewed:** 2026-05-17

---

## Scope

Phase 6 closes four hardening dimensions before the platform can on-board a second country / second pilot. None of them are tractable until production traffic + real incidents inform the threat model.

1. **Pen-test** — annual third-party penetration test
2. **Restore drills** — monthly backup-restore exercises with RPO/RTO measurement
3. **Multi-region replication** — Abidjan + Dakar read replicas for resilience and latency
4. **Per-country Keycloak realms** — delegation, regulator/auditor visitor accounts
5. **DB-per-tenant upgrade path** — VIP tenant escape hatch documented end-to-end

Each is a non-trivial chunk; total Phase 6 effort estimated at 8–12 weeks for a dedicated SRE + 1 backend engineer.

---

## 1. Pen-test (HRD-01..03)

### Pre-test checklist

- [ ] Production database snapshot taken + verified (RPO baseline)
- [ ] Staging environment refreshed from latest prod-like dataset (PII scrubbed)
- [ ] Vendor selection: short-list 3 OWASP-aligned firms operating in West Africa or remotely (suggest: ANSSI-Côte-d'Ivoire approved roster, Synacktiv, Cobalt)
- [ ] Scope of test agreed: web + API + mobile binary + S3 bucket policy + Keycloak
- [ ] Out-of-scope explicit: PowerSync internals, third-party SaaS (Vercel/Railway/Supabase)
- [ ] Test window agreed (off-hours West African / UTC+0)
- [ ] On-call rotation aware; runbook tested for "pen-test triggered alert" false-positives

### Acceptance criteria

- Zero findings of severity ≥ HIGH (CVSS 7.0+)
- All MEDIUM findings have a remediation plan committed within 30 days
- Report archived in `docs/operations/pentest-reports/YYYY-MM-DD.pdf` (gitignored, link to S3)
- Public summary published if any customer-facing change resulted

### Cadence

- First pen-test: end of v1 GA + 30 days
- Recurring: annual + after any major architecture change (schema, auth, sync engine)

---

## 2. Restore drills (HRD-04)

Backup is meaningless without verified restore. Drill monthly.

### Drill procedure (90-min window)

1. **Pick a target tenant** (rotation: smallest tenant by data volume on month 1, mid on month 2, largest on month 3, repeat)
2. **Note start time**, record from monitoring panels:
   - Last successful pgBackRest full backup timestamp
   - Last successful pgBackRest incremental
   - Last WAL segment archived
3. **Spin up a clean restore target** (`db-restore-drill-YYYY-MM-DD` Supabase project or local Postgres)
4. **Restore** using pgBackRest from S3 to point-in-time = now-1h
5. **Validate**:
   - Row counts on 5 canary tables (sites, employee, bon_de_livraison, equipment_refuel, hse_incident) match prod ± expected drift
   - chain-of-hash verification on stockpile_event, hse_incident, audit_log returns 0 breaks
   - A test login succeeds against restored Keycloak data
6. **Measure**:
   - Wall-clock RTO (Recovery Time Objective): start → first successful login
   - Data loss RPO (Recovery Point Objective): time gap between last archived WAL and chosen restore point
7. **Tear down** the restore target

### Targets

- RPO ≤ 5 minutes (WAL archival cadence)
- RTO ≤ 30 minutes for tenants < 5 GB; ≤ 90 minutes for the largest tenant
- Drill log appended to `docs/operations/restore-drill-log.md` with date, target, RPO/RTO measured, anomalies

### Escalation

If RPO/RTO miss: open a P1 ticket. Backup policy needs revision before the next on-boarding.

---

## 3. Multi-region read replicas (HRD-05)

### Goal

A Dakar (Sénégal) read replica next to the Abidjan primary so that:

- A future Dakar pilot site reads from the closer region (P95 latency target < 80 ms vs 250–400 ms cross-Atlantic to eu-west-3)
- Read-only dashboards continue to render if the primary region goes down

### Plan outline

1. Spin up the Dakar Supabase project (or AWS af-south-1 PostgreSQL if a future migration off Supabase happens)
2. Enable logical replication from primary
3. Bootstrap each tenant's data via `pg_dump` snapshot, then attach to the replication slot
4. Wire a region-aware connection routing layer at the API tier (env var `REGION_AWARE_READ_REPLICAS=true`, fallback to primary if replica lag > 30 s)
5. Acceptance test: cut primary connectivity for 5 minutes during a drill, verify read traffic still serves from the replica with a "read-only" banner on the web UI

### Risks

- PowerSync upload connector currently targets the primary; needs a router or a hold-and-retry strategy during a primary outage
- FIN-04 analytical_entry writes go to primary only — accept a write outage during primary downtime (drill explicitly tests this)

---

## 4. Per-country Keycloak realms (HRD-06)

Currently a single realm per tenant. Per-country realm gives:

- Local IT delegation: a country admin can create users without seeing other countries
- Regulator / auditor temporary access: time-boxed, read-only, scoped to one country's data
- ISO 27001 control: realm-level audit trail by country

### Migration plan

1. Add `country_code` to `tenant` (already present in master data)
2. Provision per-country realms: `gravel-ci`, `gravel-bf`, `gravel-ml`, `gravel-sn`
3. Move existing users from the global realm to the country realm matching their site
4. Cross-country roles (DIRECTION_GROUPE) become realm-level federated identities
5. Add a `/api/auditors` endpoint that mints a 7-day token in any country realm

### Out-of-scope for Phase 6

- Cross-country SSO (a Direction Groupe user logs in once, switches countries from a picker) — Phase 7
- Audit-trail consolidation (realm A admin sees realm B's audit log) — Phase 7

---

## 5. DB-per-tenant upgrade path (HRD-07)

Some prospects (especially mining majors with strict data-sovereignty constraints) demand a dedicated database. Today everyone shares one Postgres with RLS.

### Documented path

1. **Identify the tenant** (VIP flag in `tenant` table)
2. **Spin up a dedicated Supabase project** in the matching country region
3. **Snapshot + restore** the tenant's data via `pg_dump --jobs=4 -t 'tenant_id_in(...)' ...` — script in `apps/api/scripts/tenant-extract.ts`
4. **Switch the tenant's connection string** in the API's tenant-routing layer (env-driven map: `TENANT_DB_OVERRIDES_JSON`)
5. **Cut over**: 30-min downtime window; replay any in-flight outbox events on the new DB
6. **Decommission** the tenant's rows from the shared DB after a 30-day grace period

### Acceptance

- The path has been executed end-to-end at least once (drill on a synthetic tenant)
- No CTE-style cross-tenant queries exist in the codebase (verified by grep)

---

## Estimated total effort

- Pen-test prep: 1 week + 2-week vendor engagement
- Restore drill automation: 1 week build + recurring monthly 90-min window
- Multi-region replication: 3 weeks
- Per-country realms: 2 weeks (mostly migration scripting)
- DB-per-tenant runbook: 1 week build + 1 week drill

Total: ≈ 8–10 weeks of focused SRE + backend work, plus the pen-test vendor calendar.
