/**
 * RhModule (Phase 3 W0-P01) — Angular feature module for RH.
 *
 * Lazy-loaded at /rh. Provides:
 *   - EmployeeListComponent: AG Grid list with server-side filters
 *   - EmployeeFormComponent: Formly-style create/edit with habilitations sub-section
 *   - CertificationListComponent: AG Grid with status color-coding
 *   - ShiftRosterComponent: Calendar-style weekly planner
 *
 * All components are standalone and loaded via RH_ROUTES lazy imports.
 * This file serves as the feature-module barrel export.
 */
export { RH_ROUTES } from './rh-routes';
