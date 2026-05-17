# Pen-Test Findings — 2026-Q2 Internal Red-Team

Populate one entry per finding during Phase B. Severity per procedure §4 Phase C.

---

## Finding template (copy per finding)

### F-{NN} — {Short title}
- **Severity:** CRITICAL | HIGH | MEDIUM | LOW
- **Scenario:** {1-8 from SCOPE.md coverage table}
- **Discovered by:** {name}
- **Discovered on:** {date}
- **Target endpoint / module:** {e.g., POST /api/audit/export}
- **Description:**
  {What was attempted, what happened, what should have happened}
- **Reproducer:**
  ```
  {curl / sqlmap / ZAP step that reproduces}
  ```
- **Impact:**
  {Data exposure? Privilege escalation? Service degradation?}
- **CVSS (if applicable):** {score + vector}
- **Status:** OPEN | FIXED | WONT-FIX
- **Remediation ticket:** {link in REMEDIATION.md or external}

---

## Findings (populate during run)

_(none yet — populated Day 0-1)_

---

## ZAP baseline output
Attach `zap-report/baseline-report.html` from `scripts/security/zap-baseline.sh` run.
Triage automated findings here, ignoring known-false-positives (document the
exclusion rationale).
