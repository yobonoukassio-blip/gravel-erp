# Pitfalls Research — Gravel Ivoire ERP Carrière de Granite

**Domain:** Mining / Quarry ERP — multi-site, multi-pays (OHADA), offline-first mobile, IoT telematics, explosives traceability
**Researched:** 2026-05-12
**Confidence:** HIGH on domain modeling & offline sync (well-established failure modes), MEDIUM on OHADA-specific fiscal traps (regulation evolves), MEDIUM on IoT data quality (vendor-dependent)

> Scope: Pitfalls specific to mining/quarry ERPs in West African (OHADA) context. Generic ERP advice ("don't skip tests") excluded. Each pitfall maps to a roadmap phase for actionable prevention.

---

## Critical Pitfalls

### Pitfall 1: Treating Blast Records as Editable Operational Data

**What goes wrong:**
Blast plans, charging sheets (plan de tir / fiche de chargement), and post-blast reports are designed as mutable rows in a relational table — like any other production form. Six months later, a regulatory audit, a worker injury, or an insurance claim requires producing the exact blast plan as approved, who approved it, and what was actually loaded. The current row reflects post-edits and the trail is gone or unreliable.

**Why it happens:**
Developers model `blasts` as a CRUD entity. UX pressure ("the chef carrière needs to correct a typo") leads to soft-update patterns. The legal/regulatory nature of these documents is not surfaced in the data model. In OHADA mining regulation and most West African mining codes, blast records are de facto legal documents with retention obligations (typically 5–10 years depending on jurisdiction).

**How to avoid:**
- Model blast plans, charging records, and post-blast assessments as **immutable append-only events** with explicit `superseded_by` links, never UPDATE.
- Every state transition (drafted → HSE-validated → executed → post-assessed) is a new row signed (digital signature or HMAC) by the responsible role.
- Edits = new version with mandatory `reason_for_amendment` field, original remains visible.
- Generate a stable PDF/JSON snapshot at HSE validation, store in object storage with content hash, reference hash in DB.
- Separate "operational view" (current state) from "legal record" (full append-only history).

**Warning signs:**
- Schema includes `UPDATE blasts SET ...` in code
- No `created_by` + `validated_by` + `executed_by` separation
- No version/revision number on blast plans
- HSE manager has no "freeze" action
- Demo allows editing a past blast without trace

**Phase to address:** Phase Blast/Tir — must be designed correctly from day one. Retrofitting immutability after the fact is a rewrite.

---

### Pitfall 2: Explosives Inventory Modeled as Standard Stock

**What goes wrong:**
Explosives (emulsions, boosters, detonators, cordeau) are tracked like cement bags: quantity in, quantity out, stock balance. Regulators (DGMG in Côte d'Ivoire, equivalent bodies in other OHADA states) require **traceability par lot, par numéro de série pour détonateurs, par fournisseur, par destination de tir, avec rapprochement quotidien obligatoire**. Theft, loss, or unaccounted gap of even one detonator triggers a criminal investigation. The system can't produce a serial-level reconciliation.

**Why it happens:**
Inventory modules are reused from generic ERP patterns. Detonator electronic serial numbers (now standard with electronic detonators like Davey Bickford, Orica i-kon) are not first-class. The reconciliation cadence (daily, often signed by two people) is treated as a report rather than a workflow.

**How to avoid:**
- Separate `regulated_explosives_inventory` schema from general stock with stricter constraints (no soft-delete, double-signature withdrawals, lot+serial mandatory).
- Detonators tracked individually by serial number, not by quantity.
- Daily reconciliation is a **workflow with blocking state** — if not closed by midnight, next-day withdrawals are blocked.
- Powder magazine (poudrière) entries require two distinct authenticated users (M of N signature, e.g., chef tir + magasinier).
- Built-in "écart" workflow: any discrepancy auto-creates an HSE incident.
- Export-ready regulatory report (ledger format expected by mines inspectorate).

**Warning signs:**
- Detonators stored with `quantity` column
- Single-user withdrawal possible
- No daily close-of-day blocking enforcement
- "Adjustment" feature with no audit
- Lot numbers optional

**Phase to address:** Phase Explosives & Tir (must precede or be merged with blast plan phase).

---

### Pitfall 3: Naive Offline Sync — "Last Write Wins"

**What goes wrong:**
Two operators on the same site, both offline, edit the same blast plan or production report. When connectivity returns, the later sync overwrites the earlier one. Worse: a phone with stale local data syncs after a re-formatted one, wiping correct server data. In production-critical records (tonnage, fuel consumption) this directly corrupts cost-per-tonne KPIs and HSE records.

**Why it happens:**
Default sync libraries (PowerSync, WatermelonDB, naive REST sync) often default to LWW. Mobile devs underestimate concurrent-edit probability on multi-user sites. No CRDT discipline. Vector clocks / Lamport timestamps not implemented.

**How to avoid:**
- **Entity-type aware sync strategy:**
  - Append-only events (blast records, HSE incidents, weighbridge tickets) → never conflict, just append in causal order.
  - Aggregates that legitimately mutate (equipment status, work orders) → CRDT (LWW-Element-Set, OR-Set) or explicit conflict UI.
  - Critical mutable records (blast plan in draft) → server-side optimistic locking with `version` field, sync rejects stale writes and surfaces conflict to the chef carrière.
- Sync layer uses **device-id + monotonic local sequence + server-assigned global sequence** — never wall-clock from device (clocks drift, get reset, lie).
- Outbox pattern on device with idempotency keys; server dedupes.
- Test plan: chaos test with 3 devices editing same entity offline for 48h, then sync in random order. Result must be deterministic and lossless.
- Surface unresolved conflicts in a "Conflits à arbitrer" inbox for the site supervisor — never silently merge.

**Warning signs:**
- Sync code uses `device.now()` for ordering
- No `version` or `vclock` on syncable entities
- No conflict UI mockup in design
- "We'll just use Firestore / Supabase realtime" without offline conflict story
- Tests don't include concurrent offline editing

**Phase to address:** Phase Mobile Offline Foundation (must precede any field-data module).

---

### Pitfall 4: Multi-Currency Without a Disciplined FX & Rounding Model

**What goes wrong:**
Production cost in XOF, equipment leasing in EUR, spare parts in USD, fuel quoted in local pump price. The system stores `amount` and `currency` and converts on display. Months later: consolidated group P&L doesn't match site P&L by a few percent; the auditor (OHADA SYSCOHADA compliance) refuses the books. The mismatch comes from inconsistent rounding, mid-period FX rate changes, and the same invoice converted multiple times along the chain.

**Why it happens:**
- Developers store money as `float` (catastrophic) or use a single `decimal` without explicit scale per currency.
- FX rate is "current spot" instead of the regulated/contractual rate applicable at the transaction event.
- Conversion applied at read time instead of being a recorded event.
- XOF/XAF have no minor units (BCEAO: 1 FCFA = smallest unit, no centimes) — code assumes 2 decimals like EUR.

**How to avoid:**
- Money is `{amount: int64_minor_units, currency: ISO_4217, scale: int}` — never float. Use `bigint` minor units or `Decimal(19,4)`.
- Currency table with per-currency scale (XOF=0, EUR=2, USD=2, TND=3).
- **Three amounts per transaction:** original (transaction currency), site-functional (e.g., XOF), group-reporting (e.g., EUR). All three stored, not derived.
- FX rate is an immutable record: `(from, to, rate, valid_from, source)`. Each conversion stores which FX record was used.
- Rounding rule explicit per use case (banker's rounding for accounting, half-up for invoicing) — never implicit `Math.round`.
- Reconciliation report: sum of converted amounts vs. converted sum of original amounts must match within rounding tolerance.
- Reject mid-period FX changes on closed periods.

**Warning signs:**
- `amount: number` or `amount: float` in any schema
- Single `currency` field at company level only
- FX conversion in frontend code
- No `fx_rate_id` on financial transactions
- Tests don't include XOF (the most likely production currency)

**Phase to address:** Phase Finance/Accounting Foundation — set the money model before any module that touches value.

---

### Pitfall 5: Building "Yet Another Comptabilité Générale" Instead of Wrapping SYSCOHADA Export

**What goes wrong:**
Scope creep: starts as "contrôle de gestion + coût/tonne" (clearly in scope per PROJECT.md), drifts into journal entries, balance sheet, fiscal declarations. Six months in, the team realizes SYSCOHADA OHADA compliance requires a certified accounting product (Plan Comptable OHADA révisé 2017, FEC-equivalent exports, DGI/DGE-specific formats per country). Either the project ships a non-compliant accounting module that the cabinet expert-comptable refuses to use, or scope balloons by 12 months.

**Why it happens:**
Finance modules naturally invite "while we're at it" extensions. The boundary between analytical accounting (in scope) and general accounting (out of scope per PROJECT.md) is fuzzy. Stakeholder pressure: "Sage costs us X, why pay it if you're already building?"

**How to avoid:**
- Codify the boundary in the data model: ERP produces **analytical events** (cost allocations, production-driven costs, tonnage × unit cost). It does **not** produce journal entries directly bound to the Plan Comptable OHADA.
- Build a **certified export adapter** per accounting system the clients use (Sage 100/X3, Ciel, Odoo Côte d'Ivoire localization). Adapter is the integration contract.
- Reject any feature request that touches: TVA déclaration, IS computation, états financiers SYSCOHADA (bilan, compte de résultat, TAFIRE), liasse fiscale. Document the refusal in a clear "non-objectifs" page in the product.
- Engage one OHADA expert-comptable as advisor early — they will tell you what you legally cannot do without certification.

**Warning signs:**
- Schema starts including `compte_general`, `journal`, `pieces_comptables` with full PCG OHADA codes
- Backlog item: "déclaration TVA"
- Team debates whether to support FEC export
- No accounting partner integration plan after 3 months

**Phase to address:** Phase Finance — written scope guardrails in the phase brief, reviewed at every milestone.

---

### Pitfall 6: HSE Incident Records Without Chain-of-Custody Integrity

**What goes wrong:**
A fatal accident occurs. Six months later, the labor inspector and the police want the original incident report, photos at the scene, witness statements, the maintenance history of the machine, the operator's habilitation status at the time. The system has: the latest version of the incident (edited 4 times), photos that may have been replaced, a maintenance log where entries were retroactively added. The company's legal defense collapses because the records are not forensically trustworthy.

**Why it happens:**
HSE is treated as another form. Photos are stored mutably in cloud storage with overwrite-able paths. Maintenance logs allow back-dated entries. No content-hash verification. No tamper-evident log.

**How to avoid:**
- Incident records: append-only with cryptographic hash chain (each entry hashes prev entry's hash → tamper-evident).
- Photos: stored with content-addressed storage (S3 with object lock / immutability + version-id captured + SHA-256 stored separately). Original is **never overwritten**.
- Witness statements: signed (at minimum: PIN + biometric where available + timestamp + GPS + device-id captured at sign time).
- Maintenance history that may be referenced in an incident must support "as-of" queries — what did we know at incident time, not what we know now.
- Export to PDF on incident closure, store with timestamping (RFC 3161 TSA or equivalent).
- Operator habilitations: temporal validity, queryable as of any past date.

**Warning signs:**
- Incident photos overwriteable
- No `event_log` table for HSE entities
- Maintenance entries allow arbitrary `performed_at` dates
- Habilitations have a `valid_until` but no history of changes

**Phase to address:** Phase HSE & Compliance.

---

### Pitfall 7: Multi-Tenant Boundary Leaks (Site-Level Data Crossing)

**What goes wrong:**
Architecture is "multi-site multi-pays multi-tenant" but tenant isolation is enforced only at the application layer. One bad query, one missing `WHERE site_id = ?`, or one careless admin role and Site A's tonnage / costs / contracts appear in Site B's dashboard. Worse: cross-country, the Mali subsidiary sees Côte d'Ivoire payroll-equivalent figures. In a group context where sites compete internally and pay-per-tonne agreements exist, this is a trust-destroying event.

**Why it happens:**
- Shared single DB, single schema, no row-level security.
- ORM queries without forced tenant predicate.
- Admin/super-admin roles bypass isolation by default.
- Reporting/BI tools connect directly to DB bypassing app-layer filters.

**How to avoid:**
- **Defense in depth:** PostgreSQL Row-Level Security policies enforced at DB level, ORM scoping at app level, gateway-level tenant claim in JWT.
- Tenant context (org_id + country_id + site_id) injected from authenticated session, never from request parameters.
- Every table with tenant-scoped data has a `site_id` (or `org_id`/`country_id` for the right scope) **NOT NULL** and an RLS policy.
- Automated test: create two sites with identical data shapes, query as user from Site A, assert zero rows from Site B — for every table. This test must be in CI.
- BI/reporting access via read replicas with RLS-aware roles, never raw superuser.
- Cross-site aggregation only via explicit "group consolidation" service that requires group-level role.

**Warning signs:**
- No RLS policies in migrations
- Tests don't include cross-tenant isolation cases
- A "super admin" can see everything via the normal UI (vs. a dedicated forensic/audit role)
- Reports use raw SQL without tenant predicate visible in the file

**Phase to address:** Phase 1 / Foundation — set isolation model before any business module. Retrofitting is brutal.

---

### Pitfall 8: IoT Data Trusted as Source of Truth Without Sanity Layer

**What goes wrong:**
Weighbridge sends a 0-tonne ticket because of a stuck sensor — system records the truck as empty, dispatch counts it, daily production is 8% off. Fuel telematics reports a 200 L refill on a 150 L tank because of a Modbus parity error. GPS reports a haul truck "teleporting" 30 km because of multipath. All this flows directly into cost-per-tonne, fuel KPIs, and theft alerts. Operations loses trust in the system within weeks.

**Why it happens:**
- Telemetry ingested as authoritative without validation gates.
- No reconciliation between sensors (weighbridge ↔ truck cycles ↔ shovel buckets).
- No sensor health monitoring (drift, dropout, calibration date).
- Missing data treated as zero instead of "unknown".

**How to avoid:**
- **Three-layer model:** raw telemetry (immutable), validated telemetry (after sanity rules), business records (after reconciliation + human validation for outliers).
- Validation rules per sensor type: physical limits (tonnage 0–60T for a typical truck, fuel delta ≤ tank capacity), rate-of-change limits, plausibility cross-checks (GPS speed vs. position delta).
- Sensor health metrics tracked per device: uptime, last-seen, drift, calibration due-date. Surface health on a dashboard separate from production KPIs.
- Missing data is explicit: KPIs show `tonnage = 1240 (3% estimated, 1 weighbridge offline 2h)` not silently extrapolated.
- Daily reconciliation: weighbridge total ↔ truck dispatch count × average load ↔ stockpile increment. Variance > threshold opens an investigation task.
- Calibration log per sensor; ticket auto-created when calibration expires.

**Warning signs:**
- Telemetry inserted directly into business tables
- No `data_quality_flag` on any reading
- Dashboards never show "missing data"
- No sensor inventory module
- No reconciliation report

**Phase to address:** Phase IoT Integration — design the three-layer model before connecting the first device.

---

### Pitfall 9: Change Management Failure with Low-Literacy Field Operators

**What goes wrong:**
The mobile app is well-engineered but designed by urban developers for literate, smartphone-fluent users. On site, the operateur de pelle is 45, primary education, speaks Dioula or Baoulé as a first language, has used WhatsApp but never a "form". After 2 weeks, paper forms reappear in his pocket; he fills the app at the end of the shift from his paper notes (or asks the chef to do it). Data quality collapses, the offline-first investment is wasted, the "real" record is back to paper.

**Why it happens:**
- UX designed in French/English text-heavy forms with dropdowns of 30 items.
- Training is a one-hour PDF.
- No on-site champion. No iteration loop with actual operators.
- Field-relevant gestures (gloves, dust, sun glare, vibration) not tested.

**How to avoid:**
- **Icon-first, picture-driven UI** for terrain modules (foration, extraction, pointage). Text is secondary.
- Voice input + voice-to-form for languages where text is a barrier (FR + EN + at minimum one local lingua franca — Dioula in CI, with audio prompts).
- Numeric input as large +/- buttons, not keyboards. Common values as presets.
- Sun-readable contrast mode mandatory. Test on a real Android rugged device (Samsung XCover, Sonim) in actual daylight.
- Glove mode: target touch zones ≥ 12mm.
- Field champion per site, trained in person, paid a small premium. Weekly feedback loop in first 90 days post-launch.
- "Operator satisfaction" tracked as a phase exit criterion, not "did we ship the screens".
- Co-design: prototype the foration data entry with 3 real operators **before** writing production code.

**Warning signs:**
- Phase plan has "training: 2 hours" and no co-design budget
- No persona-with-photo for the actual end users
- All forms are text-heavy
- App tested only on developers' phones in offices
- No local-language plan

**Phase to address:** Phase Mobile UX Foundation + cross-cutting at every field module phase.

---

### Pitfall 10: Time Zones, DST-Adjacent Bugs, and 24h-Operations Day Boundaries

**What goes wrong:**
Quarry runs in 2 or 3 shifts; the day boundary for "production journalière" is 06:00 local (start of morning shift), not midnight. System stores UTC, displays local — fine. But the "daily production report" job runs at midnight UTC, splitting one shift across two reporting days. Multi-country: Côte d'Ivoire (UTC) and a future Mali site (UTC) are fine; but a Tunisia or Algeria expansion brings UTC+1 with DST history. Reports across years don't line up.

**Why it happens:**
- Day boundary hard-coded to `00:00` UTC.
- "Local time" assumed to be one zone.
- DST not considered (West Africa has none, but expansion plans do).
- Shift boundary not modeled as a domain concept.

**How to avoid:**
- Model `OperationalDay` explicitly per site: `(site_id, business_date, shift_start_local, shift_end_local, tz)`.
- All production events tagged with `operational_day_id` (computed at ingest), not derived at query time.
- Reports query by `operational_day_id`, never by raw `created_at` ranges.
- Store TZ per site (IANA TZ string, e.g., `Africa/Abidjan`), not country.
- Test crossing DST boundaries even if current sites don't have DST — the test cost is low and it future-proofs.

**Warning signs:**
- `WHERE created_at::date = today` anywhere in reports
- No `OperationalDay` or `Shift` entity
- TZ stored at company level only

**Phase to address:** Phase Foundation / Production Core.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Single PostgreSQL schema for all tenants (no RLS) | Fast initial setup | Cross-tenant leak risk, hard to retrofit | Never for this domain — site separation is a regulatory + commercial requirement |
| Storing money as `float` or `number` | "Just works" in JS | Rounding errors compound, OHADA audit failure | Never |
| Using `device.now()` for sync ordering | Simple sync logic | Silent data loss on clock drift / device reset | Never |
| LWW for all syncable entities | Trivial conflict resolution | Production data loss, blast plan corruption | Acceptable only for non-critical UI prefs |
| Hard-coding XOF as the only currency | Faster MVP | Rewrite when Mali/Senegal expansion hits | Acceptable for very first pilot site if isolated from group consolidation |
| Treating photos as mutable assets | Simple upload flow | HSE legal defense collapse | Never for HSE / blast / incident photos |
| Skipping sensor health module ("we'll add it later") | Faster IoT ship | KPI distrust, operator disengagement | Acceptable only for ≤ 5 sensors total |
| Letting reports query the OLTP DB directly | No ETL needed | Tenant leak risk via BI, perf collapse | OK only with RLS-aware read replicas |
| Building "just a small accounting feature" | Pleases finance stakeholder | Drifts into uncertified accounting software | Never — refuse and integrate with Sage/Odoo |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Weighbridge (Mettler Toledo, Avery, Precia Molen) | Polling serial port from app server | Edge gateway on-site (industrial PC, Raspberry Pi CM4 in rugged case), buffers locally, pushes events via MQTT, dedupes on arrival |
| Fuel telematics (Technoton, Eurosens, Veeder-Root TLS) | Trusting raw Modbus reads | Edge gateway with sanity layer, signed events, calibration metadata |
| GPS / fleet telematics (Teltonika, Queclink, Geotab) | Storing every 10s ping in OLTP | Time-series store (TimescaleDB hypertable or InfluxDB), aggregate to OLTP only |
| Mining accounting (Sage 100, Sage X3, Odoo, Ciel) | Direct DB writes | One-way export adapter (file or API) with explicit reconciliation reports |
| Mobile money / banks (Orange Money, MTN MoMo, banks) | Polling without idempotency keys | Idempotency keys on every transfer, signed callbacks verified, manual reconciliation report |
| SMS gateway (for ops alerts on poor connectivity sites) | Single provider | Multi-provider with fallback (Orange CI + Twilio international); SMS as alert channel, not data channel |
| Active Directory / IdP for group SSO | Custom auth | OIDC (Keycloak self-hosted or Azure AD), group claims drive site access |
| Electronic detonator systems (Davey Bickford DaveyTronic, Orica i-kon) | Manual serial entry | Direct integration to blasting machine logs where supported; serial scan via mobile camera otherwise |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Telemetry in main OLTP DB | Query slowdown after 2-3 months | TimescaleDB hypertable or separate time-series store | ~5–10M telemetry rows per site |
| Site-level dashboards aggregating raw rows at query time | "Loading…" 30s+ on dashboards | Pre-aggregated materialized views, refreshed per shift / per hour | ~6 months of production data per site |
| Mobile sync downloading full history | First-launch app freeze, battery drain | Incremental cursor-based sync, time-bounded historical window | First site with > 6 months data |
| Reports unbounded by date | Memory exhaustion in report worker | Mandatory date range, paginated exports | Quarterly close, year-end consolidation |
| N+1 on equipment hierarchy (site → engin → composant → intervention) | Maintenance screen slow | Eager-loaded aggregate or denormalized read model | ~50 engines per site |
| Per-request FX rate fetch from external API | Latency spikes, vendor outages | Local cached FX table, scheduled refresh | First time the FX provider has an outage |
| Photo uploads through API server | API server memory/disk pressure | Direct-to-S3 presigned uploads, async post-processing | ~10 concurrent uploads on weak connectivity |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Explosives data accessible to non-HSE roles | Insider theft, regulatory fine | Strict RBAC; explosives module behind dedicated permission + audit log on every read |
| HSE incident photos in public S3 bucket | PR disaster, lawsuit | Private bucket, presigned URLs with expiry, all access audited |
| Mobile app with persistent unencrypted local DB | Device theft = data leak (worker PII, salaries, contracts) | SQLCipher / EncryptedSharedPreferences; biometric unlock; remote wipe |
| Operator credentials shared (1 phone per shift) | No accountability for data entry | Per-operator PIN + photo at shift handover; audit `who_entered` always |
| API tokens hardcoded in mobile app for IoT vendor | Token leak via APK reverse | Tokens scoped per device, rotated, never embedded |
| Group consolidation accessible by site admins | Competitive info leak between sites | Group role distinct from site admin; explicit consent / role grant |
| Backup tapes / dumps unencrypted | Stolen backup = full data leak | At-rest encryption with KMS, separate key custodians |
| No audit log on "Direction Groupe" actions | Privileged misuse undetectable | Full action log including reads for sensitive entities (explosives, incidents, contracts) |
| Country data crossing borders without legal basis | Data sovereignty violation (some OHADA states have local data residency rules) | Per-country data residency strategy from day one; legal review per country before onboarding |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Long dropdowns of equipment / sites / employees | Operator picks wrong item | Site context auto-set; recent / favorites; barcode/QR scan |
| Forms expecting precise GPS that won't lock under stockpiles | Operator can't submit | Allow manual zone selection as fallback; flag for review |
| Modal alerts during data entry | Operator dismisses without reading | Inline non-blocking warnings; require explicit ack only for HSE-critical |
| Decimal point vs. comma confusion (FR uses comma) | Wrong tonnage by factor 10 or 100 | Locale-aware input with live formatted preview, sanity check on submit |
| Date pickers requiring scroll through years | Slow entry | Default to today; quick "shift -1 day" / "shift +1" |
| Photos required even when impossible (night shift, dust storm) | Operator submits black photo | Allow "no photo + reason" with HSE review |
| Long sign-in flows | Operators stay logged in on shared devices | Short PIN re-auth on sensitive actions; quick shift-handover screen |
| No "draft / pending sync" indicator | Operator unsure if data saved | Persistent sync status badge, per-record state visible |

---

## "Looks Done But Isn't" Checklist

- [ ] **Blast records:** Often missing **legal immutability** — verify a past blast cannot be edited and that PDF snapshot is hash-verified.
- [ ] **Offline sync:** Often missing **concurrent-edit conflict UI** — verify chaos test with 3 devices, 48h offline, deterministic merge.
- [ ] **Multi-currency:** Often missing **XOF zero-decimal handling** — verify totals match SYSCOHADA rounding rules.
- [ ] **Explosives inventory:** Often missing **serial-level detonator tracking** — verify regulatory ledger export matches physical magazine count.
- [ ] **HSE incidents:** Often missing **photo immutability + hash chain** — verify tamper-evidence test.
- [ ] **Tenant isolation:** Often missing **RLS at DB layer** — verify cross-tenant test in CI for every table.
- [ ] **IoT pipelines:** Often missing **sensor health dashboard** — verify a stuck weighbridge surfaces an alert, not silent zeros.
- [ ] **Daily reconciliation:** Often missing **blocking workflow** — verify next-day operations are blocked when prior day not closed.
- [ ] **Operational day:** Often missing **shift-based day boundary** — verify "today's production" matches what the chef carrière counts manually.
- [ ] **Mobile UX:** Often missing **field-realistic testing** — verify on rugged device, with gloves, under direct sun.
- [ ] **Reports:** Often missing **"as-of" semantics** — verify a historical report regenerated today matches the snapshot taken back then.
- [ ] **Habilitations:** Often missing **temporal validity history** — verify "was operator X habilitated on date Y?" answers correctly.
- [ ] **Backup/restore:** Often missing **periodic restore drill** — verify a real restore in <4h, not just "backups exist".
- [ ] **Accounting export:** Often missing **reconciliation report** — verify exported sum to Sage == sum of source events.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Blast records were mutable | HIGH | Freeze current state, lock historical, build append-only model alongside, migrate by snapshotting current state as v1, audit gaps with regulator if material |
| LWW sync caused data loss | HIGH | Restore from device-side logs if outbox kept history; otherwise lost. Switch to event-sourced sync, communicate transparently to ops |
| Money stored as float | HIGH | Add `decimal` column in parallel, dual-write, reconcile, cut over; fix all historical reports; expect 2–4 weeks |
| Cross-tenant data leak | CRITICAL | Immediate access audit log review, regulator/customer disclosure if material, RLS retrofit, full pen-test re-do |
| IoT data trusted blindly | MEDIUM | Backfill `data_quality_flag = unknown` on historical, build sanity layer, regenerate KPIs with quality bands |
| HSE photos mutable | HIGH (legal) | Immediate freeze, snapshot all current photos to immutable storage with hash, document chain of custody break to legal counsel |
| Drifted into accounting territory | MEDIUM | Hard scope reset; identify which features are non-compliant; deprecate with migration plan to Sage/Odoo |
| Operator adoption failed | MEDIUM | Pause feature work, run 2-week co-design sprint on site, redesign top 3 forms, retrain with local champion |
| Multi-currency rounding wrong | HIGH | Recompute historical with correct rules, surface variance, communicate to finance, restate prior reports |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Blast records mutability | Phase Tir / Explosifs | Schema has append-only event table; UI exposes "version history"; PDF snapshot with hash on validation |
| Explosives serial tracking | Phase Explosifs | Regulatory export report passes mock inspection; daily close blocking enforced |
| Offline sync conflicts | Phase Mobile Foundation (Phase 1 or 2) | Chaos test in CI; conflict inbox exists; no `device.now()` in sync code (lint rule) |
| Multi-currency model | Phase Finance Foundation | All money columns are bigint/Decimal; FX events immutable; reconciliation report green |
| Accounting scope creep | Continuous (every milestone review) | Scope guardrails document signed; export adapter exists; "non-objectifs" page in product |
| HSE chain of custody | Phase HSE | Photo immutability test; hash chain verifier on incident export; "as-of" queries work |
| Tenant isolation | Phase Foundation (Phase 0/1) | RLS policies in every migration; cross-tenant test green in CI; BI uses RLS-aware role |
| IoT data quality | Phase IoT Integration | Three-layer model deployed; sensor health dashboard live; reconciliation report runs daily |
| Operator adoption | Phase Mobile UX + every field module | Co-design sessions logged; rugged-device test recorded; field champion identified per pilot site |
| Operational day boundary | Phase Production Core | `OperationalDay` entity exists; all production reports use it; DST-crossing test green |

---

## Sources

- OHADA Acte uniforme révisé Plan Comptable (2017) — analytical vs. general accounting boundary
- Code minier de Côte d'Ivoire (Loi n° 2014-138, modifications subséquentes) — explosives traceability and blast records retention
- ISEE (International Society of Explosives Engineers) blast record best practices
- Patterns: Martin Kleppmann, "Designing Data-Intensive Applications" (CRDTs, event sourcing, multi-region)
- PostgreSQL Row-Level Security docs (defense-in-depth tenant isolation)
- TimescaleDB / InfluxDB documentation on telemetry separation patterns
- Field experience reports: SAP Mining, Pitram, MineSight rollout post-mortems (operator adoption failures, scope creep into accounting)
- BCEAO regulations on FCFA / XOF (no minor units) and FX recording requirements
- ISO 45001 (HSE management) and MSHA-equivalent practices for incident record integrity
- Vendor docs: Mettler Toledo IND-series weighbridges, Technoton fuel sensors, Davey Bickford DaveyTronic, Orica i-kon (electronic detonator integration patterns)

**Confidence notes:**
- HIGH on: blast/explosives immutability, offline sync patterns, money model, tenant isolation, IoT three-layer model. These are well-documented failure modes with established mitigations.
- MEDIUM on: OHADA-specific fiscal export formats per country (varies by jurisdiction and evolves; requires per-country expert-comptable validation at onboarding).
- MEDIUM on: specific vendor IoT integration quirks (depend on actual hardware chosen at procurement).
- LOW on: local-language UX specifics for Dioula/Baoulé voice input (requires user research with target operators; assumptions here are directional, not validated).

---
*Pitfalls research for: Gravel Ivoire ERP Carrière de Granite*
*Researched: 2026-05-12*
