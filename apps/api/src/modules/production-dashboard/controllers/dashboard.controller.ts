import { Controller, Get, Query, Req } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

interface AuthedRequest {
  user: { userId: string; tenantId: string };
}

interface MaintenanceKpi {
  equipmentId: string;
  equipmentLabel: string;
  mtbfHours: number | null;
  mttrHours: number | null;
  failureCount: number;
  status: string;
}

/** Dashboard catch-all endpoints not scoped to site-director or quarry-chief. */
@Controller('dashboard')
export class DashboardController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /**
   * GET /dashboard/maintenance-kpis — MTBF/MTTR per equipment for a site.
   * Joins equipment_availability with production_equipment for label + status.
   */
  @Get('maintenance-kpis')
  async maintenanceKpis(
    @Query('siteId') siteId: string | undefined,
    @Req() req: AuthedRequest,
  ): Promise<MaintenanceKpi[]> {
    return this.ds.query<MaintenanceKpi[]>(
      `SELECT ea.equipment_id         AS "equipmentId",
              COALESCE(pe.label, ea.equipment_id::text) AS "equipmentLabel",
              ea.mtbf_hours::float    AS "mtbfHours",
              ea.mttr_hours::float    AS "mttrHours",
              ea.failure_count        AS "failureCount",
              COALESCE(pe.status, 'unknown') AS "status"
       FROM equipment_availability ea
       LEFT JOIN production_equipment pe
              ON pe.id = ea.equipment_id AND pe.tenant_id = ea.tenant_id
       WHERE ea.tenant_id = $1
         AND ($2::uuid IS NULL OR pe.site_id = $2::uuid)
       ORDER BY ea.failure_count DESC
       LIMIT 100`,
      [req.user.tenantId, siteId ?? null],
    );
  }
}
