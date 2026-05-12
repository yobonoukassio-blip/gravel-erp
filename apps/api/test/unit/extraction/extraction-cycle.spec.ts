// Unit-tier wrapper — re-exports the colocated module spec so Jest's `unit`
// project (testMatch test/unit/**/*.spec.ts) executes EXT-01 coverage.
//
// Tests themselves live with the module per W1-P03 files_modified contract:
//   src/modules/extraction/tests/extraction-cycle.spec.ts
import '../../../src/modules/extraction/tests/extraction-cycle.spec';
