# Pen-Test Procedure (HRD-MVP-01)

> Repeatable adversarial test procedure for the Gravel Ivoire ERP. Per Phase 6
> CONTEXT D-01..D-04 the scope is **OWASP Top 10 + application-layer + API
> auth/RBAC bypass**; the target is **staging seeded with synthetic data**;
> executors are an **internal red-team** (per D-03); acceptance is **zero CRITICAL
> findings, all HIGH ticketed** (per D-04). The gate phrasing — zero CRITICAL — is
> intentional and mirrored in `REMEDIATION.md`.

## 1. Scope (D-01 — v1.1)

**IN scope:**
- OWASP Top 10 (2021) — full sweep against staging
- Application-layer attacks: authentication, authorization, input validation, business logic
- API: auth bypass, RBAC bypass, IDOR, mass assignment, rate-limit evasion
- Multi-tenant: RLS leak attempts (ADR-0001 3-layer defense), cross-tenant data exposure
- Audit chain manipulation (ADR-0004)
- HSE incident mutation attempts (ADR-0008)
- Offline weighing-ticket collision / race (ADR-0009)
- JWT → CLS → GUC middleware bypass attempts

**OUT of scope (deferred to v2):**
- AWS / network / Kubernetes infrastructure
- Physical security
- Social engineering
- Third-party services (Brevo, Twilio, Supabase platform — their responsibility)
- DDoS / volumetric attacks
- Production environment (only staging — see D-02)

## 2. Tooling (FOSS only per `feedback_free_tools_only`)

- **OWASP ZAP** (baseline + active scans) — primary
- **Caido Community** — manual testing, request crafting
- **sqlmap** — for any endpoint suspected of injection
- **JWT tool / jwt.io** — token forgery attempts (must use OFFLINE for staging tokens;
  never submit prod tokens to web tools)
- **Postman / Insomnia** — orchestrated RBAC bypass scenarios
- **psql** + service_role key (staging only!) — verify RLS by direct DB read attempts

## 3. Target (D-02)

- **Environment:** staging only
- **Data:** synthetic, generated via `bash scripts/security/staging-seed-synthetic.sh`
  (calls existing `db:seed:demo`)
- **CRITICAL:** No production data ever touches staging — RLS leak risk during testing
  would itself be a P0 incident. Verify staging DB connection string before each run.

## 4. Procedure (one run, 2-3 day time-box)

### Phase A — Preparation (Day -1)
1. Copy `.planning/pen-tests/{YYYY-Q{n}}-internal-red-team/SCOPE.md.template` to
   `.planning/pen-tests/{YYYY-Q{n}}-internal-red-team/SCOPE.md`
2. Fill in: dates, participants, in-scope module list, out-of-scope items
3. Seed staging: `bash scripts/security/staging-seed-synthetic.sh`
4. Run baseline ZAP scan: `bash scripts/security/zap-baseline.sh https://staging-gravel.vercel.app`
5. Triage automated findings into FINDINGS.md (template provided)

### Phase B — Internal Red-Team (Day 0-1, D-03)
Pair adversarially: each team member attacks a module they did **NOT** build. Examples:
- The author of the Finance module attacks the Audit module
- The author of the Sync module attacks the RLS middleware
- The author of the Notification module attacks the HSE immutability

Documented attack scenarios (minimum coverage):

1. **RLS leak** — log in as tenant A, attempt to query tenant B data via:
   - SQL injection vector on any tenant-scoped endpoint
   - parameter tampering on tenant_id query param
   - GraphQL/REST injection of `tenant_id` overrides in request body
2. **JWT forgery** — strip alg, use 'none' alg, swap kid, replay expired token,
   replay revoked token
3. **RBAC bypass** — `OPERATEUR` attempts `COMPLIANCE_OFFICER` endpoints; site-A user
   attempts site-B mutation; horizontal escalation via mass-assignment of `role`
4. **Audit chain tamper** — DB-level row `UPDATE` attempts (RLS-bypassed via
   service_role on staging only) to verify the verifier catches the break
5. **HSE incident mutation** — attempt UPDATE on incident after closure
   (ADR-0008 immutability)
6. **Weighing ticket collision** — submit identical offline-numbered tickets from
   2 clients simultaneously (ADR-0009)
7. **Mass assignment** — POST extra fields (`createdAt`, `tenantId`, `role`) to see
   if they overwrite server state
8. **Rate-limit bypass** — distribute requests across IPs / change User-Agent /
   use HTTP/2 multiplexing

### Phase C — Reporting (Day 2)

Severity scoring per common code-review levels:

| Level    | Action |
|----------|--------|
| CRITICAL | **BLOCK** ship — must fix before v1.1 cutover |
| HIGH     | Remediation ticket required (tracked in REMEDIATION.md) |
| MEDIUM   | Tech-debt backlog |
| LOW      | Tech-debt backlog (optional) |

- Populate `FINDINGS.md` with one entry per issue
- Populate `REMEDIATION.md` with one row per HIGH/CRITICAL with owner + due date

### Phase D — Acceptance Gate (D-04)

- **Zero CRITICAL findings** → required to proceed with v1.1 cutover (HRD-MVP-08)
- **All HIGH have remediation tickets** → required
- **MEDIUM/LOW logged** in `.planning/ROADMAP.md` tech-debt → required (no silent omissions)

If a CRITICAL exists: FIX → re-test affected module → re-run acceptance gate.

## 5. Cadence

- Per major release minimum (so: each milestone v{n}.0 launch)
- Plus on-demand after any auth / RLS / audit code change

## 6. v2 future expansion

- Third-party pen-test (paid firm) → v2 milestone budget
- Infrastructure pen-test (AWS / K8s) → v2 milestone
- Continuous DAST in CI → consider once v1.1 stable

## 7. References

- D-01, D-02, D-03, D-04 in `.planning/phases/06-hardening-scale-multi-country-rollout/06-CONTEXT.md`
- ADR-0001 (RLS), ADR-0004 (audit chain), ADR-0008 (HSE immutability), ADR-0009 (weighing ticket)
- HRD-MVP-08 cutover runbook (`.planning/runbooks/v1.1-cutover.md`) — this procedure is a T-7d pre-flight item
