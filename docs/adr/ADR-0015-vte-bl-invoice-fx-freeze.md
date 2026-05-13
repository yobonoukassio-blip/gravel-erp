# ADR-0015 — VTE BL + Invoice + FX Freeze

## Status

Draft — Phase 3 W0-P01. Date: 2026-05-13. Authors: Phase 3 planner + executor.

## Context

Sales operations involve:
1. Bon de Livraison (BL) — delivery notes generated offline by field agents in trucks.
2. Invoices — generated in batch from validated BLs.
3. Multi-currency — XOF and EUR primarily; USD for some international contracts.
4. FX rates — XOF/EUR peg is fixed (655.957 XOF = 1 EUR, BCEAO fixed rate), but
   XOF/USD fluctuates. Invoice batch must capture the rate at the date of invoicing,
   not at the date of BL creation.

Key constraints:
- BL numbers must be meaningful to field agents (truck drivers, site managers) even offline.
- FX rate must be frozen at invoice time (not re-computed on every PDF regeneration).
- All monetary values must use `dinero.js` bigint minor units (ADR money rule: no floats).
- The invoice batch must fail pre-flight if any BL date is missing an FX rate.

## Decision

### BL offline numbering scheme

BL numbers follow the same scheme as weighing tickets (ADR-0009):
```
SITE_CODE-BL-YYYYMMDD-DEVICE_ID-SEQ
```
Example: `SITE_CI_01-BL-20260513-MOB001-042`

Components:
- `SITE_CODE` — 2-digit site code from master data.
- `BL` — fixed literal.
- `YYYYMMDD` — local calendar date of BL creation (device clock, site timezone).
- `DEVICE_ID` — 5-character device identifier from `flutter_secure_storage`.
- `SEQ` — 3-digit daily sequence number, reset at 000 each day per device.

The same collision-avoidance reasoning as ADR-0009 applies: (DEVICE_ID, date, SEQ) is unique
per device per day with overwhelming probability.

### FX rate snapshot (immutable)

`fx_rate_snapshot` table: unique constraint on `(tenant_id, from_currency, to_currency, rate_date)`.
Once created, a rate is immutable — no UPDATE or DELETE allowed (trigger-enforced).

Seeded rates:
- EUR/XOF: 655.957 (BCEAO fixed peg, never changes; seeded at tenant creation).
- XOF/USD: entered daily by `FINANCE_OFFICER` via the FX rates admin page.
- USD/XOF: derived from XOF/USD via `1 / rate`.

### Invoice batch pre-flight check

`InvoiceService.createBatch(blIds[], invoiceDate)` runs a pre-flight query:
```sql
SELECT DISTINCT bl.currency,
       CASE WHEN fxr.id IS NULL THEN 'MISSING' ELSE 'OK' END AS rate_status
  FROM bon_de_livraison bl
  LEFT JOIN fx_rate_snapshot fxr
    ON fxr.from_currency = bl.currency
   AND fxr.to_currency = 'XOF'
   AND fxr.rate_date = $invoiceDate
 WHERE bl.id = ANY($blIds)
   AND bl.currency != 'XOF';
```
If any `rate_status = 'MISSING'`, the batch throws `ERR_FX_RATE_MISSING` (422)
listing the missing (currency, date) pairs. Batch is atomic: all BLs converted at the
same FX rate, or none.

### All money in dinero.js bigint minor units

`line_total`, `unit_price`, `total_ht`, `total_ttc` are stored in the DB as `BIGINT`
(minor units). `XOF` has 0 decimal places; `EUR` has 2; `USD` has 2.

The EUR/XOF conversion is exact: `655.957 XOF = 1 EUR`. In minor units:
- `1 EUR` = `100 EUR cents` = `65595 XOF minor units` (XOF has 0 minor units → XOF = itself).
- Conversion: `amount_xof = amount_eur_minor_units * 65595 / 100`. Use integer arithmetic only.

EUR/XOF peg is pre-seeded in `fx_rate_snapshot` as a fraction `(65595, 100)` stored
as `numerator INT` / `denominator INT` to avoid float representation.

## Consequences

**Positive:**
- FX freeze eliminates audit disputes ("the invoice shows a different rate than today").
- Pre-flight batch check is a user-friendly error (lists missing rates) rather than a silent partial failure.
- BL offline numbering follows the same scheme as weighing tickets — drivers already know the pattern.

**Negative:**
- EUR/XOF peg seeding must happen at tenant creation. If not seeded, all invoice batches involving
  EUR contracts fail. Mitigated by tenant setup checklist in ops runbook.
- FINANCE_OFFICER must enter XOF/USD daily. If they forget, invoices for USD contracts are blocked.
  Mitigated by `rh.certification.expiring_soon`-style daily reminder alert.

## Alternatives Considered

| Alternative | Why rejected |
|-------------|-------------|
| FX rate from external API | Adds external dependency, availability risk, and requires rate auditing. Regulators want a human-attested rate, not an automated one. |
| Re-compute FX on PDF regeneration | Different regenerations produce different amounts — audit nightmare. Freeze at invoice creation time. |
| Float for XOF/EUR | `float(655.957)` = `655.9570000000001` in IEEE 754. `dinero.js` bigint eliminates this. ADR money rule: no floats. |
| UUID-only BL numbers | Field agents cannot verify "BL 042 of today" from UUID. Human-readable scheme is required. |

## References

- ADR-0009 (weighing ticket offline numbering — same SITE-TYPE-DATE-DEVICE-SEQ scheme)
- `apps/api/src/common/money/dinero.helpers.ts`
- `apps/api/src/modules/master-data/entities/fx-rate.entity.ts`
- CLAUDE.md: "Money bigint minor units + dinero.js v2 + banker's rounding"
