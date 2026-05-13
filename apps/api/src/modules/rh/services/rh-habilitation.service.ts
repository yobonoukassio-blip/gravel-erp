import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface CertificationExpiry {
  employeeId: string;
  employeeFirstName: string;
  employeeLastName: string;
  certCode: string;
  certLabel: string;
  validTo: string;
  daysUntilExpiry: number;
}

/**
 * RhHabilitationService (RH-04, HSE-04, Phase 3 Pitfall #7).
 *
 * Provides the habilitation gate used by:
 *   - TIR W1-P02 blast-plan loading: isValidAt(operatorId, 'PERMIS_EXPLOSIFS', shiftDate)
 *   - MNT W2-P04 work-order assignment: isValidAt(techId, 'FORMATION_HSE', today)
 *
 * CRITICAL: `isValidAt` always accepts an explicit `asOfDate` — it NEVER
 * calls `new Date()` internally. Callers supply the operational date so that:
 *   1. Replayed events produce deterministic results.
 *   2. Unit tests can exercise boundary conditions without time-travel.
 *
 * See ADR-0011-rh-habilitation-as-of.md.
 */
@Injectable()
export class RhHabilitationService {
  private readonly logger = new Logger(RhHabilitationService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Returns true when the employee holds a valid certification of `certCode`
   * on `asOfDate`.
   *
   * The query checks:
   *   ec.valid_from <= asOfDate AND ec.valid_to >= asOfDate
   * Both bounds are DATE-inclusive (not TIMESTAMPTZ) because certifications
   * are calendar-day granular.
   *
   * @param employeeId  UUID of the employee (direct-hire or subcontractor)
   * @param certCode    Certification type code (e.g. 'PERMIS_EXPLOSIFS')
   * @param asOfDate    The operational date to check against — NEVER new Date() in callers
   * @returns           true if a valid certification exists; false otherwise
   */
  async isValidAt(
    employeeId: string,
    certCode: string,
    asOfDate: Date,
  ): Promise<boolean> {
    const rows = (await this.ds.query(
      `SELECT 1
         FROM employee_certification ec
         JOIN certification_type ct ON ct.id = ec.certification_type_id
        WHERE ec.tenant_id = current_setting('app.current_tenant', TRUE)::uuid
          AND ec.employee_id = $1
          AND ct.code = $2
          AND ec.valid_from <= $3::date
          AND ec.valid_to   >= $3::date
        LIMIT 1`,
      [employeeId, certCode, asOfDate.toISOString().slice(0, 10)],
    )) as Array<Record<string, unknown>>;

    return rows.length > 0;
  }

  /**
   * Returns certifications expiring within `withinDays` of `asOfDate`
   * for all employees at `siteId`.
   *
   * Emits `rh.certification.expiring_soon` via EventEmitter2 when count > 0,
   * which the AlertsModule translates into an alert row.
   *
   * @param siteId      Site UUID to filter employees
   * @param asOfDate    Reference date — NEVER new Date() in callers
   * @param withinDays  Lookahead window in days (e.g. 30)
   */
  async getExpiringCertifications(
    siteId: string,
    asOfDate: Date,
    withinDays: number,
  ): Promise<CertificationExpiry[]> {
    const asOfStr = asOfDate.toISOString().slice(0, 10);
    const horizon = new Date(asOfDate);
    horizon.setDate(horizon.getDate() + withinDays);
    const horizonStr = horizon.toISOString().slice(0, 10);

    const rows = (await this.ds.query(
      `SELECT
          ec.id,
          ec.employee_id,
          e.first_name AS employee_first_name,
          e.last_name  AS employee_last_name,
          ct.code AS cert_code,
          ct.label AS cert_label,
          ec.valid_to,
          (ec.valid_to::date - $1::date) AS days_until_expiry
         FROM employee_certification ec
         JOIN certification_type ct ON ct.id = ec.certification_type_id
         JOIN employee e ON e.id = ec.employee_id
        WHERE ec.tenant_id = current_setting('app.current_tenant', TRUE)::uuid
          AND e.site_id = $2
          AND ec.valid_from <= $1::date
          AND ec.valid_to   >= $1::date
          AND ec.valid_to   <= $3::date
        ORDER BY ec.valid_to ASC`,
      [asOfStr, siteId, horizonStr],
    )) as Array<{
      employee_id: string;
      employee_first_name: string;
      employee_last_name: string;
      cert_code: string;
      cert_label: string;
      valid_to: string;
      days_until_expiry: string;
    }>;

    const expiring: CertificationExpiry[] = rows.map((r) => ({
      employeeId: r.employee_id,
      employeeFirstName: r.employee_first_name,
      employeeLastName: r.employee_last_name,
      certCode: r.cert_code,
      certLabel: r.cert_label,
      validTo: r.valid_to,
      daysUntilExpiry: parseInt(r.days_until_expiry, 10),
    }));

    if (expiring.length > 0) {
      this.events.emit('rh.certification.expiring_soon', {
        tenantId: null, // resolved from CLS by AlertsModule
        payload: {
          site_id: siteId,
          count: expiring.length,
          expiring_certs: expiring,
          as_of_date: asOfStr,
          within_days: withinDays,
        },
      });
      this.logger.warn(
        `[RhHabilitation] ${expiring.length} certifications expiring within ${withinDays}d at site ${siteId}`,
      );
    }

    return expiring;
  }
}
