/**
 * REQ: FND-06 — audit trail immuable + chain-of-hash par (tenant, table).
 * Source: D-27, D-28, PITFALLS.md #1, #6, #7.
 * Implementing plan: W1-P02 (data-platform — audit triggers + verifier).
 *
 * Invariant under test (Wave 0 RED):
 *   audit_log.row_hash[n] = sha256(audit_log.row_hash[n-1] || canonical_json(payload))
 *   partition by (tenant_id, table_name).
 */

describe('FND-06: Audit trail immutable chain-of-hash', () => {
  it('audit chain invariant: row_hash[n] = sha256(row_hash[n-1] || canonical_json(payload)) per (tenant,table)', () => {
    throw new Error('NOT IMPLEMENTED — plan W1-P02 (audit triggers + chain verifier)');
  });

  it('tampered audit_log row is detected by verifier', () => {
    throw new Error('NOT IMPLEMENTED — plan W1-P02');
  });

  it('audit_log is append-only — UPDATE/DELETE raise via revoked grants + trigger guard', () => {
    throw new Error('NOT IMPLEMENTED — plan W1-P02');
  });

  it('chain is partitioned per (tenant_id, table_name) — cross-tenant tampering does not affect verification', () => {
    throw new Error('NOT IMPLEMENTED — plan W1-P02');
  });
});
