/**
 * REQ: FND-08 — OperationalDay résolu correctement + DST-crossing test.
 * Source: D-19, D-20, D-21, D-22, PITFALLS.md #9.
 * Implementing plan: W1-P02 (master-data — OperationalDay/Shift entities + resolver).
 *
 * Wave 0 RED.
 */

describe('FND-08: OperationalDay + DST handling', () => {
  it('OperationalDay derives business_date from (shift_start_local, iana_timezone, utc_now)', () => {
    throw new Error('NOT IMPLEMENTED — plan W1-P02 (OperationalDay)');
  });

  it('Europe/Paris 2026-10-25 02:30 local resolves consistently across DST end fall-back', () => {
    // PITFALLS.md #9: DST fall-back creates an ambiguous local time (02:30 occurs twice).
    // The resolver must deterministically choose first or second occurrence per business rule.
    throw new Error('NOT IMPLEMENTED — plan W1-P02 (DST resolver)');
  });

  it('Africa/Abidjan (UTC+0, no DST) resolves business_date with shift_start_local=06:00', () => {
    throw new Error('NOT IMPLEMENTED — plan W1-P02');
  });

  it('all reports query via operational_day_id, NEVER created_at::date (D-20 lint rule)', () => {
    throw new Error('NOT IMPLEMENTED — plan W1-P02');
  });

  it('Shift FK on OperationalDay enables day/night/3x8 patterns (D-22)', () => {
    throw new Error('NOT IMPLEMENTED — plan W1-P02');
  });
});
