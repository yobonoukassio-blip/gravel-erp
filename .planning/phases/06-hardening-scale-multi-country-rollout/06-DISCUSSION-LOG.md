# Phase 6: Hardening, Scale & Multi-Country Rollout — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-17
**Phase:** 06-hardening-scale-multi-country-rollout
**Areas discussed:** Scope framing (Phase 6A vs 6B split)

---

## Scope Framing

Phase 6 was discovered to be explicitly listed under `## Deferred (v2)` in ROADMAP.md, with its 13 requirement IDs (HRD-01..08, EXP-01..04, SST-01..02) marked "v2 only" and absent from REQUIREMENTS.md. The v1.1 milestone (Phases 7, 8, 9) was functionally complete at discussion time.

| Option | Description | Selected |
|--------|-------------|----------|
| Promote part of Phase 6 into v1.1 (production-readiness MVP) | Some hardening genuinely needed before first paying customer. Cut a slim v1.1 scope; defer expansion/multi-region/IoT to v2. | (partial — see below) |
| Start v2 milestone now — Phase 6 belongs there | v1.1 is done. Run `/gsd:complete-milestone` first, then `/gsd:new-milestone v2`, then plan Phase 6 inside v2. | |
| Plan Phase 6 in full as currently scoped | Treat 'v2 deferred' label as stale; plan all 13 REQs now. | |
| Just scope-explore — generate CONTEXT.md as a thinking exercise | No commitment to plan or execute. | (partial — see below) |

**User's response:** "prends toutes les meilleures options" (take all the best options)

**Interpretation:** Synthesize a hybrid — promote a slim v1.1 production-hardening MVP (option 1) AND document the full v2 deferred scope as future reference (option 4). This serves both immediate planning input and v2 scope record.

**Rationale captured in CONTEXT.md:** Phase 6 split into Section 6A (v1.1-MVP to plan now: pen-test, backup drill, DR runbook, secrets rotation, audit export, SLOs, sync chaos extension, cutover runbook — 8 tracks, all genuinely block first-customer go-live) and Section 6B (v2-deferred: multi-region, second-country expansion, IoT broker stack, service mesh, third-party pen-test, AWS infra pen-test, DB-per-tenant migration).

---

## Claude's Discretion

The user delegated the full scope split to Claude with "prends toutes les meilleures options". Specific implementation choices left to downstream agents (pen-test tooling selection, Prometheus exporter picks, chaos harness implementation, runbook formatting, SLO window length) are documented in CONTEXT.md `<decisions>` § Claude's Discretion.

## Deferred Ideas

Full Section 6B (multi-country EXP, multi-region HRD, IOT-01/02/03, SST-01/02, third-party pen-test, AWS infra pen-test, DB-per-tenant) captured in CONTEXT.md `<deferred>` for v2 milestone planning.

## Process Note

Standard discuss-phase 4-question-per-area interactive flow was abbreviated because:
1. User explicitly delegated scope decisions ("prends toutes les meilleures options")
2. Phase 6 had no defined requirements in REQUIREMENTS.md to interrogate
3. The most consequential decision (v1.1-promote vs v2-defer split) was answered in the single framing question above
4. All downstream decisions (D-01 through D-25) followed deterministically from that split + existing project decisions (ADR-0001, ADR-0004, ADR-0005, CLAUDE.md tech stack)

If user wants finer-grained interactive Q&A on specific decisions (pen-test scope, SLO targets, runbook scenarios), re-run `/gsd:discuss-phase 6` and select "Update it".
