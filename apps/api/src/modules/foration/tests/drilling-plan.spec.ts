/**
 * Pointer file. The actual spec runs from apps/api/test/unit/foration/
 * because Jest projects scope `testMatch` to <rootDir>/test/. This file
 * exists for the plan's colocated-spec convention (matches W0
 * production-equipment.spec.ts pattern) and so grep-based plan
 * acceptance checks find a file by the expected name.
 *
 * Run: `pnpm --filter=@gravel/api test foration`
 *
 * See: ../../../test/unit/foration/drilling-plan.spec.ts
 */
export {};
