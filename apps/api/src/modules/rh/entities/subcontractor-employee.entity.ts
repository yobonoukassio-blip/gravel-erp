/**
 * SubcontractorEmployee — re-exported type alias for clarity.
 *
 * Subcontractor employees are stored in the same `employee` table with
 * `subcontractor_id` set and `site_id = null`. This keeps `employee_certification`
 * FK paths identical for direct-hire and subcontractor staff.
 *
 * Usage: import { SubcontractorEmployee } from './subcontractor-employee.entity';
 * is equivalent to import { Employee } from './employee.entity' but communicates intent.
 */
export { Employee as SubcontractorEmployee } from './employee.entity';
