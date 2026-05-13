import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { ContractType } from '../entities/employee.entity';

export interface CreateEmployeeInput {
  tenantId: string;
  siteId?: string | null;
  subcontractorId?: string | null;
  firstName: string;
  lastName: string;
  employeeNumber?: string | null;
  contractType: ContractType;
  roleCode: string;
  hiredDate?: string | null;
  createdBy: string;
}

export interface UpdateEmployeeInput {
  firstName?: string;
  lastName?: string;
  employeeNumber?: string | null;
  contractType?: ContractType;
  roleCode?: string;
  isActive?: boolean;
  hiredDate?: string | null;
}

export interface EmployeeRow {
  id: string;
  tenant_id: string;
  site_id: string | null;
  subcontractor_id: string | null;
  first_name: string;
  last_name: string;
  employee_number: string | null;
  contract_type: ContractType;
  role_code: string;
  is_active: boolean;
  hired_date: string | null;
  created_by: string;
  created_at_utc: string;
  updated_at_utc: string;
}

export interface ListEmployeeFilters {
  siteId?: string;
  isActive?: boolean;
  certCode?: string;
  certValidAsOf?: string;
  limit?: number;
  offset?: number;
}

/**
 * EmployeeService (RH-01).
 *
 * CRUD for employees (direct-hire and subcontractor). Includes:
 *   - blockClosure / resolveClosure on operational_day.closure_blockers
 */
@Injectable()
export class EmployeeService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async create(input: CreateEmployeeInput): Promise<EmployeeRow> {
    this.assertSiteOrSubcontractor(input.siteId, input.subcontractorId);

    const rows = (await this.ds.query(
      `INSERT INTO employee (
         tenant_id, site_id, subcontractor_id, first_name, last_name,
         employee_number, contract_type, role_code, is_active, hired_date, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9, $10)
       RETURNING *`,
      [
        input.tenantId,
        input.siteId ?? null,
        input.subcontractorId ?? null,
        input.firstName,
        input.lastName,
        input.employeeNumber ?? null,
        input.contractType,
        input.roleCode,
        input.hiredDate ?? null,
        input.createdBy,
      ],
    )) as EmployeeRow[];

    return rows[0];
  }

  async findById(id: string, tenantId: string): Promise<EmployeeRow> {
    const rows = (await this.ds.query(
      `SELECT * FROM employee WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    )) as EmployeeRow[];

    if (rows.length === 0) {
      throw new NotFoundException({ code: 'EMPLOYEE_NOT_FOUND' });
    }
    return rows[0];
  }

  async list(tenantId: string, filters: ListEmployeeFilters = {}): Promise<EmployeeRow[]> {
    const params: unknown[] = [tenantId];
    const conditions: string[] = ['e.tenant_id = $1'];

    if (filters.siteId) {
      params.push(filters.siteId);
      conditions.push(`e.site_id = $${params.length}`);
    }
    if (filters.isActive !== undefined) {
      params.push(filters.isActive);
      conditions.push(`e.is_active = $${params.length}`);
    }

    let certJoin = '';
    if (filters.certCode && filters.certValidAsOf) {
      params.push(filters.certCode);
      const codeParam = params.length;
      params.push(filters.certValidAsOf);
      const dateParam = params.length;
      certJoin = `
        JOIN employee_certification ec
          ON ec.employee_id = e.id
          AND ec.tenant_id = e.tenant_id
        JOIN certification_type ct
          ON ct.id = ec.certification_type_id
          AND ct.code = $${codeParam}
          AND ec.valid_from <= $${dateParam}::date
          AND ec.valid_to   >= $${dateParam}::date
      `;
    }

    const where = conditions.join(' AND ');
    const limit = filters.limit ?? 100;
    const offset = filters.offset ?? 0;
    params.push(limit, offset);

    const rows = (await this.ds.query(
      `SELECT DISTINCT e.*
         FROM employee e
         ${certJoin}
        WHERE ${where}
        ORDER BY e.last_name, e.first_name
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    )) as EmployeeRow[];

    return rows;
  }

  async update(id: string, tenantId: string, input: UpdateEmployeeInput): Promise<EmployeeRow> {
    const sets: string[] = [];
    const params: unknown[] = [];

    const appendSet = (col: string, val: unknown) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };

    if (input.firstName !== undefined) appendSet('first_name', input.firstName);
    if (input.lastName !== undefined) appendSet('last_name', input.lastName);
    if (input.employeeNumber !== undefined) appendSet('employee_number', input.employeeNumber);
    if (input.contractType !== undefined) appendSet('contract_type', input.contractType);
    if (input.roleCode !== undefined) appendSet('role_code', input.roleCode);
    if (input.isActive !== undefined) appendSet('is_active', input.isActive);
    if (input.hiredDate !== undefined) appendSet('hired_date', input.hiredDate);

    if (sets.length === 0) {
      return this.findById(id, tenantId);
    }

    params.push(id, tenantId);
    const rows = (await this.ds.query(
      `UPDATE employee SET ${sets.join(', ')}
        WHERE id = $${params.length - 1} AND tenant_id = $${params.length}
        RETURNING *`,
      params,
    )) as EmployeeRow[];

    if (rows.length === 0) {
      throw new NotFoundException({ code: 'EMPLOYEE_NOT_FOUND' });
    }
    return rows[0];
  }

  /**
   * Append a blocker reason to operational_day.closure_blockers array.
   * Idempotent: if the reason already exists, the array is unchanged.
   */
  async blockClosure(dayId: string, reason: string): Promise<void> {
    await this.ds.query(
      `UPDATE operational_days
          SET closure_blockers = CASE
            WHEN closure_blockers @> $2::jsonb THEN closure_blockers
            ELSE closure_blockers || $2::jsonb
          END
        WHERE id = $1`,
      [dayId, JSON.stringify([reason])],
    );
  }

  /**
   * Remove a blocker reason from operational_day.closure_blockers array.
   * No-op if the reason is not present.
   */
  async resolveClosure(dayId: string, reason: string): Promise<void> {
    // Remove all occurrences of the reason string from the JSONB array.
    await this.ds.query(
      `UPDATE operational_days
          SET closure_blockers = (
            SELECT jsonb_agg(elem)
              FROM jsonb_array_elements(closure_blockers) AS elem
             WHERE elem::text != $2::text
          )
        WHERE id = $1`,
      [dayId, JSON.stringify(reason)],
    );
  }

  private assertSiteOrSubcontractor(
    siteId: string | null | undefined,
    subcontractorId: string | null | undefined,
  ): void {
    if (!siteId && !subcontractorId) {
      throw new BadRequestException({
        code: 'EMPLOYEE_SITE_OR_SUBCONTRACTOR_REQUIRED',
        message: 'Either site_id or subcontractor_id must be provided.',
      });
    }
  }
}
