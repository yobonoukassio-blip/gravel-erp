// Unit-tier wrapper — re-exports the colocated module spec so Jest's `unit`
// project executes FIN-R01 coverage from the canonical location.
import '../../../src/modules/analytics/tests/analytical-entry-writer.spec';
