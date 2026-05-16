import { Controller, Get, Query } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Read-only certification listing endpoint (RH-04 web surface).
 * Joins employee_certification + certification_type so the UI shows
 * holder name, type label, expiry date, etc.
 */
@Controller('rh/certifications')
export class CertificationController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  @Get()
  async list(
    @Query('site_id') siteId?: string,
    @Query('tenant_id') tenantId?: string,
  ): Promise<unknown[]> {
    const params: unknown[] = [];
    const where: string[] = [];
    if (tenantId) { params.push(tenantId); where.push(`ec.tenant_id = $${params.length}`); }
    if (siteId)   { params.push(siteId);   where.push(`e.site_id = $${params.length}`); }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.ds.query(
      `SELECT
         ec.id,
         ec.tenant_id,
         ec.employee_id,
         e.first_name || ' ' || e.last_name AS employee_name,
         ec.certification_type_id,
         ct.label                            AS certification_label,
         ec.valid_from,
         ec.valid_to,
         ec.certificate_number,
         ec.document_sha256,
         ec.created_at_utc
       FROM employee_certification ec
       JOIN employee e          ON e.id = ec.employee_id
       JOIN certification_type ct ON ct.id = ec.certification_type_id
       ${whereClause}
       ORDER BY ec.valid_to DESC NULLS LAST`,
      params,
    );
  }
}
