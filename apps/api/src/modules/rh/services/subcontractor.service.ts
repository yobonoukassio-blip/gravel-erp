import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface CreateSubcontractorInput {
  tenantId: string;
  companyName: string;
  countryIso2: string;
  contractReference?: string | null;
}

export interface SubcontractorRow {
  id: string;
  tenant_id: string;
  company_name: string;
  country_iso2: string;
  contract_reference: string | null;
  is_active: boolean;
  created_at_utc: string;
  updated_at_utc: string;
}

/**
 * SubcontractorService (RH-01).
 *
 * CRUD for subcontractor companies. Their employees are managed via EmployeeService
 * with `subcontractorId` set.
 */
@Injectable()
export class SubcontractorService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async create(input: CreateSubcontractorInput): Promise<SubcontractorRow> {
    const rows = (await this.ds.query(
      `INSERT INTO subcontractor (tenant_id, company_name, country_iso2, contract_reference)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.tenantId, input.companyName, input.countryIso2, input.contractReference ?? null],
    )) as SubcontractorRow[];

    return rows[0];
  }

  async findById(id: string, tenantId: string): Promise<SubcontractorRow> {
    const rows = (await this.ds.query(
      `SELECT * FROM subcontractor WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    )) as SubcontractorRow[];

    if (rows.length === 0) {
      throw new NotFoundException({ code: 'SUBCONTRACTOR_NOT_FOUND' });
    }
    return rows[0];
  }

  async list(tenantId: string, isActive?: boolean): Promise<SubcontractorRow[]> {
    const params: unknown[] = [tenantId];
    let activeClause = '';
    if (isActive !== undefined) {
      params.push(isActive);
      activeClause = ` AND is_active = $${params.length}`;
    }
    return (await this.ds.query(
      `SELECT * FROM subcontractor WHERE tenant_id = $1${activeClause} ORDER BY company_name`,
      params,
    )) as SubcontractorRow[];
  }

  async archive(id: string, tenantId: string): Promise<SubcontractorRow> {
    const rows = (await this.ds.query(
      `UPDATE subcontractor SET is_active = FALSE WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId],
    )) as SubcontractorRow[];

    if (rows.length === 0) {
      throw new NotFoundException({ code: 'SUBCONTRACTOR_NOT_FOUND' });
    }
    return rows[0];
  }
}
