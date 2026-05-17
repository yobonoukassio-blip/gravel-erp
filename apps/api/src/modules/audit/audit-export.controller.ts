import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../identity/guards/roles.guard';
import { Roles } from '../identity/decorators/roles.decorator';
import { AuditExportService } from './audit-export.service';
import type { AuditExportResponse } from './audit-export.types';

/**
 * GET /api/audit/export?tenant_id={uuid}&from={iso}&to={iso}
 *
 * Per D-14 signature: returns chain-verified audit rows + 24h presigned CSV URL.
 *
 * RBAC (HRD-MVP-05, ADR-0001):
 *  - DIRECTION_GROUPE: cross-tenant platform admin role (acts as PLATFORM_ADMIN).
 *  - FINANCE: tenant compliance officer for OHADA / ISO 27001 audit exports.
 *  Note: dedicated COMPLIANCE_OFFICER role is not yet in the GravelRole union;
 *  FINANCE is the closest semantic match per CLAUDE.md (Finance owns audit /
 *  cost / consolidation). Tenant-scoping is enforced by RLS + by the explicit
 *  tenant_id query param.
 */
@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditExportController {
  constructor(private readonly svc: AuditExportService) {}

  @Get('export')
  @Roles('DIRECTION_GROUPE', 'FINANCE')
  async export(
    @Query('tenant_id') tenantId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ): Promise<AuditExportResponse> {
    if (!tenantId || !from || !to) {
      throw new BadRequestException('tenant_id, from, to are required');
    }
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException('from and to must be ISO-8601 timestamps');
    }
    if (fromDate >= toDate) {
      throw new BadRequestException('from must be strictly less than to');
    }
    return this.svc.export({ tenantId, from: fromDate, to: toDate });
  }
}
