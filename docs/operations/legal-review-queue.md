# Legal Review Queue

**Created:** 2026-05-12
**Policy:** *Items pending legal review do not block code. A reasonable default is applied; legal outcome may flip the default — tracked as deviation and PR adjustment.*

## Items awaiting legal review

| Item | Why | Status | Default applied while pending |
|------|-----|--------|-------------------------------|
| s3-object-lock-7y-retention | HSE attachments OHADA audit alignment — choose between Governance (override by root) vs Compliance (no override even by root) for 7-year retention | pending | Governance mode applied per D2-61 — switchable to Compliance after legal sign-off (single OpenTofu variable flip; no data migration required for new buckets). |
| hse-severity-scale-civil-code | Severity 1–5 maps to CI mining accident reporting categories — confirm Article references | pending | DSI default: 1=mineur, 2=arrêt court, 3=arrêt prolongé, 4=invalidité, 5=fatal/catastrophique. Used by `severity ≥ 4` closure-block rule (D2-62). |
| weighing-ticket-as-legal-evidence | Whether the offline-generated `ticket_number` (`SITE-YYYYMMDD-DEVICE-SEQ`) + `content_hash` constitutes legal evidence for sales BL chain (Phase 3 ventes) | pending | Phase 2: internal rotations only, no legal external use. Format documented in ADR-0009. |
| capa-verification-mandatory-role | Whether `CAPA verified` step must be performed by `HSE_OFFICER` or can be performed by `SITE_MANAGER` per OHADA mining standards | pending | Default: HSE_OFFICER or SITE_MANAGER (broader) — narrowable later without schema change (RBAC only). |
| ohada-export-format | Sage/Ciel/Odoo target format for Phase 4 OHADA analytical export — out of Phase 2 scope but flagged for early legal review | scheduled (Phase 4 prep) | N/A — no Phase 2 code touches export. |

## How items leave the queue

When legal returns a verdict:
1. Update the row's status to `done — <YYYY-MM-DD>`
2. If default applied diverges from verdict, open a PR to flip the default. Reference this row.
3. Do **not** delete the row — historical audit trail.

---

*Plan 02-W0-P01 Task 1 — Wave 0 foundations*
