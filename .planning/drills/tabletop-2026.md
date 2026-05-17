# Tabletop Drill — 2026

**Owner:** Tech lead (facilitator, non-rotating)
**Status:** Scheduled (date locks at v1.1 cutover-date freeze)
**Source of truth for:** HRD-MVP-03 D-10 (first annual tabletop drill)

---

## Scenario for 2026

**Scenario #1: Primary DB total loss** (per D-10 — first tabletop must run before v1.1 cutover).

Reference: [`.planning/runbooks/disaster-recovery.md`](../runbooks/disaster-recovery.md) §3 (DB total loss) + §7 (annual schedule).

---

## Schedule

- **Target date:** T-3d before first paying customer cutover (exact date TBD — update this line when cutover date is locked)
- **Duration:** 2 hours (90 min drill + 30 min retro buffer)
- **Format:** Synchronous video call (Google Meet / Zoom) + shared doc updates in real time
- **Participants:**
  - SRE on-call rota (all members — rotating role must touch the muscles)
  - Tech lead (facilitator)
  - Customer success lead (drives the comms drill portion)
- **Facilitator:** tech lead (non-rotating — provides drill consistency year-over-year)
- **Observer (optional):** CISO / compliance officer

---

## Pre-drill checklist

Run T-1d before the drill:

- [ ] Latest backup drill artifact within 30d (per HRD-MVP-02 `.planning/drills/backup-YYYYMM.md`)
- [ ] DR runbook scenario #1 (`disaster-recovery.md` §3) re-read by all participants
- [ ] Scratch infra reservation booked (Terraform target `infra/dr` validated against current state)
- [ ] pgBackRest credentials + S3 access verified (test list-objects on backup bucket)
- [ ] Communication templates pre-populated with placeholders + a test recipient (internal email)
- [ ] Stopwatch / timer ready for RTO measurement (Grafana annotation also works)
- [ ] Test tenant + test data identified (NEVER touch a real customer's data during drill)
- [ ] Shared retro doc created with §"Post-drill report" pre-populated

---

## Drill script (90 min)

| Phase | T+    | Duration | Activity                                                                                                                |
| ----- | ----- | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1     | T+0   | 5 min    | **Incident declaration.** Facilitator announces: "Supabase prod went dark at HH:MM UTC. /health returns 503. Supabase status page shows confirmed data loss in our region." |
| 2     | T+5   | 10 min   | **Detection validation.** On-call validates the 3 detection signals per runbook §3.1 (pg_up alert, Supabase status, /health probe). Declares P0 in Grafana OnCall. |
| 3     | T+15  | 15 min   | **Decision tree traversal.** Team walks runbook §3.2 decision tree out loud. Agrees on restore-from-pgBackRest path. Logs decision in retro doc. |
| 4     | T+30  | 30 min   | **Execute restore commands** against SCRATCH infra (DO NOT touch prod). Run Terraform apply, pgBackRest restore to PITR T-5min, verify row counts on top 10 tables. |
| 5     | T+60  | 15 min   | **Verify health + audit chain.** Repoint test API to restored DB, confirm /health green, run audit-chain verifier across test tenants. |
| 6     | T+75  | 15 min   | **Customer comms drill.** Customer success lead drafts FR + EN initial + update + resolution emails using runbook §3.5 templates. Sends to internal test mailbox. Measures time-to-first-comms. |
| 7     | T+90  | 10 min   | **Retro.** What worked, what didn't, action items with owners + due dates. Update retro doc inline. |

---

## Success criteria

- [ ] All recovery steps in runbook §3.3 executed end-to-end against scratch infra
- [ ] Customer comms (initial) drafted + sent within 30 min of detection (matches §2 severity matrix)
- [ ] Measured RTO ≤ 1h target (per D-06 / runbook §3.4)
- [ ] Measured RPO ≤ 5min (PITR target reached without data gap)
- [ ] Audit-chain verifier reports zero false-positive chain breaks on restored data
- [ ] Zero action items left unowned
- [ ] Drill report (below) fully populated within 48h

---

## Post-drill report

Populate after drill completion. Commit this file with the populated table as the audit artifact.

| Item                                                | Result                                                                 |
| --------------------------------------------------- | ---------------------------------------------------------------------- |
| Date executed                                       | _(YYYY-MM-DD HH:MM UTC)_                                               |
| Participants                                        | _(list names + role)_                                                  |
| Facilitator                                         | _(name)_                                                               |
| Measured detection lag (signal → page → ack)        | _(N min)_                                                              |
| Measured RTO (ack → service restored on scratch)    | _(N min — target ≤ 60)_                                                |
| Measured RPO (data lost vs last-known-good)         | _(N min — target ≤ 5)_                                                 |
| Customer comms delivered within 30 min target?      | Y / N                                                                  |
| Audit-chain verification clean on restored data?    | Y / N                                                                  |
| Scratch infra teardown confirmed?                   | Y / N (no orphaned scratch resources billing us)                       |
| Action items                                        | _(list — see below)_                                                   |
| Lessons → runbook updates                           | _(list of PR refs that updated `disaster-recovery.md`)_                |
| Next year scenario per §7 rotation                  | 2027 → Scenario #2 (Tenant compromise) → `tabletop-2027.md`            |

### Action items log

| # | Action | Owner | Due date | Status |
| - | ------ | ----- | -------- | ------ |
| 1 | _(e.g., reduce restore command time by pre-warming Terraform state)_ | _(name)_ | _(YYYY-MM-DD)_ | open / done |

---

## References

- **DR runbook:** [`.planning/runbooks/disaster-recovery.md`](../runbooks/disaster-recovery.md) §3 (DB total loss scenario) + §7 (annual schedule)
- **D-10:** Phase 6 decision in `.planning/phases/06-hardening-scale-multi-country-rollout/06-CONTEXT.md`
- **HRD-MVP-02:** monthly backup drill artifacts (`.planning/drills/backup-YYYYMM.md`) — restore commands proven here are exercised end-to-end in this tabletop
- **D-06:** RTO 1h / RPO 5min targets validated during this drill
