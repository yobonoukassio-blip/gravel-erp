# Pen-Test Scope — 2026-Q2 Internal Red-Team

## Metadata
- **Run ID:** 2026-Q2-internal-red-team
- **Window:** 2026-05-26 → 2026-05-28 (3-day time-box; aligned to v1.1 cutover T-7d)
- **Target:** https://{staging-url} (env var `STAGING_URL` during run)
- **Lead:** {tech lead} (non-rotating)
- **Participants:** all engineering team

## Pairing matrix (per D-03 — each attacks a module they did NOT build)

| Attacker | Target module | Author of target |
|----------|---------------|------------------|
| {name1}  | Audit module + chain export (W1-P05) | {name2} |
| {name2}  | RLS middleware + JWT→CLS→GUC | {name1} |
| {name3}  | HSE incident immutability | {name4} |
| {name4}  | Weighing-ticket offline numbering | {name3} |
| {name5}  | Sync deadletter replay (W2-P03) | {name1} |

(Fill names from the current team roster on Day -1.)

## In-scope modules
- Auth (JWT validation, refresh, RBAC guards)
- All API endpoints under `/api/*`
- RLS + `TenantAwareRepository`
- Audit chain (verifier + export endpoint)
- HSE incident lifecycle (immutability post-closure)
- Sync ingress + deadletter replay
- Notification dispatch (BullMQ enqueue endpoints)

## Out-of-scope
- AWS infrastructure
- Supabase platform (their pen-test)
- Brevo / Twilio (their responsibility)
- Production environment (D-02)
- Physical / social engineering

## Attack scenario coverage (minimum)
Per procedure §4 Phase B — 8 scenarios. Mark each at end-of-run as TESTED / NOT-TESTED.

| # | Scenario | Owner | Status |
|---|----------|-------|--------|
| 1 | RLS leak | — | NOT-TESTED |
| 2 | JWT forgery | — | NOT-TESTED |
| 3 | RBAC bypass | — | NOT-TESTED |
| 4 | Audit chain tamper | — | NOT-TESTED |
| 5 | HSE incident mutation | — | NOT-TESTED |
| 6 | Weighing ticket collision | — | NOT-TESTED |
| 7 | Mass assignment | — | NOT-TESTED |
| 8 | Rate-limit bypass | — | NOT-TESTED |

## Acceptance gate (D-04)
- Zero CRITICAL → required for v1.1 cutover sign-off
- All HIGH ticketed in `REMEDIATION.md`
- MEDIUM/LOW in this repo's tech-debt section of `ROADMAP.md`

## Sign-off
- [ ] Tech lead
- [ ] Customer Success lead (informed only)
