/**
 * HRD-MVP-07 — Extended sync chaos spec (D-20).
 *
 * Load profile per Phase 6 CONTEXT D-20:
 *   - 1000 synthetic rotations
 *   - 100 concurrent virtual mobile clients
 *   - 30% server-side write-conflict injection
 *
 * Acceptance thresholds (D-20 / SLO-D / D-22):
 *   - deadletter rate < 1%
 *   - ConflictRegistry size >= injected conflict count (no silent drops)
 *   - p95 convergence < 60s
 *   - simulated client crash rate < 0.5% (D-22 rugged-Android budget)
 *
 * KNOWN LIMITATION (documented per checker INFO 7 + SUMMARY "Known Stubs"):
 *   The harness used here is an in-memory simulator (`runHarness`) that
 *   exercises the spec's contract and acceptance thresholds. Wiring it to a
 *   real NestJS test instance + PowerSync ingress is tracked as a follow-up;
 *   see `.planning/runbooks/sync-deadletter-triage.md` §10. The current
 *   spec proves the harness API + thresholds compile and the weekly CI
 *   workflow can publish a report. Replacing `runHarness(opts)` with a real
 *   ingress driver is a single substitution point.
 *
 * Extends the FND-11 baseline (./sync-chaos.spec.ts).
 */
import {
  generateRotations,
  injectConflicts,
  p95,
  runHarness,
  type HarnessOptions,
  type HarnessResult,
} from './sync-chaos-harness';

const TENANT_IDS = ['tenant-ci-01', 'tenant-ci-02', 'tenant-bf-01'];
const SITE_IDS = ['site-abj-nord', 'site-abj-sud', 'site-bouake', 'site-bobo'];

describe('Sync chaos — extended (HRD-MVP-07, D-20)', () => {
  const opts: HarnessOptions = {
    rotationCount: 1000,
    concurrentClients: 100,
    conflictInjectionRate: 0.3,
    tenantIds: TENANT_IDS,
    siteIds: SITE_IDS,
  };

  let result: HarnessResult;

  beforeAll(() => {
    result = runHarness(opts);
  }, 120_000);

  it('Test 1: runs the documented 1000 × 100 × 30% load (D-20)', () => {
    expect(result.totalSubmitted).toBe(1000);
  });

  it('Test 2: keeps deadletter rate < 1% (D-20 acceptance)', () => {
    expect(result.deadletterRate).toBeLessThan(0.01);
  });

  it('Test 3: tracks every conflict in the registry — no silent drops (D-20)', () => {
    expect(result.conflictRegistrySize).toBeGreaterThanOrEqual(result.totalConflicts);
  });

  it('Test 4: p95 convergence under 60s (SLO-D baseline)', () => {
    expect(result.p95ConvergenceMs).toBeLessThan(60_000);
  });

  it('Test 5: simulated client crash rate < 0.5% (D-22)', () => {
    const crashRate = result.simulatedClientCrashes / opts.concurrentClients;
    expect(crashRate).toBeLessThan(0.005);
  });

  it('Test 6: harness primitives — generateRotations + injectConflicts + p95 are pure and deterministic in shape', () => {
    const rotations = generateRotations({
      ...opts,
      rotationCount: 10,
      concurrentClients: 2,
    });
    expect(rotations).toHaveLength(10);
    expect(rotations[0].clientId).toBe('client-0');
    expect(rotations[1].clientId).toBe('client-1');
    expect(rotations[0].payload.ticketNumber).toMatch(/^T-\d{6}$/);

    // injectConflicts at rate=0 is a no-op (identity on payload values).
    const same = injectConflicts(rotations, 0);
    expect(same).toHaveLength(rotations.length);
    expect(same.every((r, i) => r.payload.tonnage === rotations[i].payload.tonnage)).toBe(true);

    expect(p95([])).toBe(0);
    expect(p95([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(10);
  });
});
