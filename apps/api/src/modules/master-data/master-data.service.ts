import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { DataSource, QueryFailedError } from 'typeorm';
import { CLS_KEYS } from '../../common/cls/tenant-context';
import { CURRENCY_SCALE } from '@gravel/shared-types';
import {
  CreateSiteDto,
  GeoJsonPointDto,
  ListSitesQuery,
  UpdateSiteDto,
} from './dto/site.dto';
import { CreateZoneDto, GeoJsonPolygonDto, UpdateZoneDto } from './dto/zone.dto';
import { CreateBenchDto, UpdateBenchDto } from './dto/bench.dto';
import {
  AttachmentPresignDto,
  CreatePermitDto,
  UpdatePermitDto,
} from './dto/permit.dto';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface SiteRow {
  id: string;
  tenant_id: string;
  country_id: string;
  code: string;
  name: string;
  gps_point_geojson: string;
  iana_timezone: string;
  functional_currency: string;
  manager_user_id: string | null;
  capacity_t_per_day: string | null;
  status: string;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface ZoneRow {
  id: string;
  tenant_id: string;
  site_id: string;
  code: string;
  name: string;
  geometry_geojson: string;
  status: string;
  archived_at: Date | null;
}

interface BenchRow {
  id: string;
  tenant_id: string;
  production_zone_id: string;
  code: string;
  name: string;
  geometry_geojson: string;
  elevation_m: string | null;
  status: string;
  archived_at: Date | null;
}

interface PermitRow {
  id: string;
  tenant_id: string;
  site_id: string;
  type: string;
  authority: string;
  reference: string;
  valid_from: string;
  valid_to: string;
  document_url: string | null;
  status: string;
  archived_at: Date | null;
}

/**
 * Master-data CRUD service. Every method runs inside a TypeORM transaction so
 * the TenantRlsSubscriber (W1-P02) sets `app.tenant_id` GUC before any
 * statement — RLS enforces tenant isolation at the row level.
 *
 * Geometry columns are serialized to GeoJSON via ST_AsGeoJSON in SELECTs and
 * parsed from GeoJSON via ST_GeomFromGeoJSON in INSERT/UPDATE. The HTTP wire
 * format is GeoJSON only (no WKT leakage past the service boundary).
 *
 * Soft-delete per D-26: archive endpoints set `status='archived'` and
 * `archived_at=now()`. No hard-delete code path exists.
 */
@Injectable()
export class MasterDataService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cls: ClsService,
  ) {}

  // ─── helpers ────────────────────────────────────────────────────────────

  private requireTenantId(): string {
    const tenantId = this.cls.get<string>(CLS_KEYS.TENANT_ID);
    if (!tenantId) {
      throw new BadRequestException(
        'No tenant context. Master-data operations require an authenticated request.',
      );
    }
    return tenantId;
  }

  private validateIanaTimezone(tz: string): void {
    try {
      const resolved = new Intl.DateTimeFormat(undefined, { timeZone: tz }).resolvedOptions()
        .timeZone;
      if (!resolved) {
        throw new Error('empty resolved tz');
      }
    } catch {
      throw new BadRequestException(`Invalid IANA timezone '${tz}'.`);
    }
  }

  private validateCurrency(code: string): void {
    if (!(code in CURRENCY_SCALE)) {
      throw new BadRequestException(
        `Unknown currency '${code}'. Allowed: [${Object.keys(CURRENCY_SCALE).join(', ')}]`,
      );
    }
  }

  private clampLimit(limit?: number): number {
    if (!limit) return DEFAULT_LIMIT;
    return Math.min(limit, MAX_LIMIT);
  }

  private parseGeoJson<T>(raw: string | null): T | null {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private toSiteResponse(row: SiteRow) {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      countryId: row.country_id,
      code: row.code,
      name: row.name,
      gpsPoint: this.parseGeoJson<GeoJsonPointDto>(row.gps_point_geojson),
      ianaTimezone: row.iana_timezone,
      functionalCurrency: row.functional_currency,
      managerUserId: row.manager_user_id,
      capacityTPerDay: row.capacity_t_per_day !== null ? Number(row.capacity_t_per_day) : null,
      status: row.status,
      archivedAt: row.archived_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private toZoneResponse(row: ZoneRow) {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      siteId: row.site_id,
      code: row.code,
      name: row.name,
      geometry: this.parseGeoJson<GeoJsonPolygonDto>(row.geometry_geojson),
      status: row.status,
      archivedAt: row.archived_at,
    };
  }

  private toBenchResponse(row: BenchRow) {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      productionZoneId: row.production_zone_id,
      code: row.code,
      name: row.name,
      geometry: this.parseGeoJson<GeoJsonPolygonDto>(row.geometry_geojson),
      elevationM: row.elevation_m !== null ? Number(row.elevation_m) : null,
      status: row.status,
      archivedAt: row.archived_at,
    };
  }

  private toPermitResponse(row: PermitRow) {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      siteId: row.site_id,
      type: row.type,
      authority: row.authority,
      reference: row.reference,
      validFrom: row.valid_from,
      validTo: row.valid_to,
      documentUrl: row.document_url,
      status: row.status,
      archivedAt: row.archived_at,
    };
  }

  private wrapUniqueViolation(error: unknown, ctx: string): never {
    if (error instanceof QueryFailedError) {
      const code = (error as QueryFailedError & { code?: string }).code;
      if (code === '23505') {
        throw new ConflictException(`Duplicate ${ctx}.`);
      }
    }
    throw error as Error;
  }

  // ─── Sites ──────────────────────────────────────────────────────────────

  async createSite(dto: CreateSiteDto) {
    this.validateIanaTimezone(dto.ianaTimezone);
    this.validateCurrency(dto.functionalCurrency);
    const tenantId = this.requireTenantId();
    try {
      const rows: SiteRow[] = await this.dataSource.transaction(async (mgr) => {
        return mgr.query(
          `INSERT INTO sites (
             tenant_id, country_id, code, name, gps_point,
             iana_timezone, functional_currency, manager_user_id, capacity_t_per_day
           ) VALUES (
             $1, $2, $3, $4, ST_GeomFromGeoJSON($5),
             $6, $7, $8, $9
           )
           RETURNING id, tenant_id, country_id, code, name,
                     ST_AsGeoJSON(gps_point) AS gps_point_geojson,
                     iana_timezone, functional_currency, manager_user_id,
                     capacity_t_per_day, status, archived_at, created_at, updated_at`,
          [
            tenantId,
            dto.countryId,
            dto.code,
            dto.name,
            JSON.stringify(dto.gpsPoint),
            dto.ianaTimezone,
            dto.functionalCurrency,
            dto.managerUserId ?? null,
            dto.capacityTPerDay ?? null,
          ],
        );
      });
      return this.toSiteResponse(rows[0]);
    } catch (error) {
      this.wrapUniqueViolation(error, 'site code for this tenant');
    }
  }

  async listCountries(): Promise<
    Array<{
      id: string;
      isoAlpha2: string;
      name: string;
      defaultCurrency: string;
      defaultTimezone: string;
    }>
  > {
    this.requireTenantId();
    const rows: Array<{
      id: string;
      iso_alpha2: string;
      name: string;
      default_currency: string;
      default_timezone: string;
    }> = await this.dataSource.transaction((mgr) =>
      mgr.query(
        `SELECT id, iso_alpha2, name, default_currency, default_timezone
           FROM countries
          WHERE archived_at IS NULL
          ORDER BY name ASC`,
      ),
    );
    return rows.map((r) => ({
      id: r.id,
      isoAlpha2: r.iso_alpha2,
      name: r.name,
      defaultCurrency: r.default_currency,
      defaultTimezone: r.default_timezone,
    }));
  }

  async listSites(query: ListSitesQuery) {
    this.requireTenantId();
    const limit = this.clampLimit(query.limit);
    const offset = query.offset ?? 0;
    const includeArchived = query.includeArchived === 'true';

    const rows: SiteRow[] = await this.dataSource.transaction(async (mgr) => {
      return mgr.query(
        `SELECT id, tenant_id, country_id, code, name,
                ST_AsGeoJSON(gps_point) AS gps_point_geojson,
                iana_timezone, functional_currency, manager_user_id,
                capacity_t_per_day, status, archived_at, created_at, updated_at
           FROM sites
          WHERE ($1 OR archived_at IS NULL)
          ORDER BY name ASC
          LIMIT $2 OFFSET $3`,
        [includeArchived, limit, offset],
      );
    });

    const [{ count }] = await this.dataSource.transaction((mgr) =>
      mgr.query(
        `SELECT COUNT(*)::int AS count FROM sites WHERE ($1 OR archived_at IS NULL)`,
        [includeArchived],
      ),
    );

    return {
      data: rows.map((r) => this.toSiteResponse(r)),
      meta: { total: count, offset, limit },
    };
  }

  async getSite(id: string) {
    this.requireTenantId();
    const rows: SiteRow[] = await this.dataSource.transaction((mgr) =>
      mgr.query(
        `SELECT id, tenant_id, country_id, code, name,
                ST_AsGeoJSON(gps_point) AS gps_point_geojson,
                iana_timezone, functional_currency, manager_user_id,
                capacity_t_per_day, status, archived_at, created_at, updated_at
           FROM sites WHERE id = $1`,
        [id],
      ),
    );
    if (rows.length === 0) throw new NotFoundException(`Site ${id} not found.`);
    return this.toSiteResponse(rows[0]);
  }

  async updateSite(id: string, dto: UpdateSiteDto) {
    if (dto.ianaTimezone) this.validateIanaTimezone(dto.ianaTimezone);
    if (dto.functionalCurrency) this.validateCurrency(dto.functionalCurrency);
    this.requireTenantId();

    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    if (dto.name !== undefined) {
      sets.push(`name = $${i++}`);
      params.push(dto.name);
    }
    if (dto.ianaTimezone !== undefined) {
      sets.push(`iana_timezone = $${i++}`);
      params.push(dto.ianaTimezone);
    }
    if (dto.functionalCurrency !== undefined) {
      sets.push(`functional_currency = $${i++}`);
      params.push(dto.functionalCurrency);
    }
    if (dto.gpsPoint !== undefined) {
      sets.push(`gps_point = ST_GeomFromGeoJSON($${i++})`);
      params.push(JSON.stringify(dto.gpsPoint));
    }
    if (dto.managerUserId !== undefined) {
      sets.push(`manager_user_id = $${i++}`);
      params.push(dto.managerUserId);
    }
    if (dto.capacityTPerDay !== undefined) {
      sets.push(`capacity_t_per_day = $${i++}`);
      params.push(dto.capacityTPerDay);
    }

    if (sets.length === 0) {
      return this.getSite(id);
    }

    params.push(id);
    const rows: SiteRow[] = await this.dataSource.transaction((mgr) =>
      mgr.query(
        `UPDATE sites SET ${sets.join(', ')}, updated_at = now()
           WHERE id = $${i}
       RETURNING id, tenant_id, country_id, code, name,
                 ST_AsGeoJSON(gps_point) AS gps_point_geojson,
                 iana_timezone, functional_currency, manager_user_id,
                 capacity_t_per_day, status, archived_at, created_at, updated_at`,
        params,
      ),
    );
    if (rows.length === 0) throw new NotFoundException(`Site ${id} not found.`);
    return this.toSiteResponse(rows[0]);
  }

  async archiveSite(id: string) {
    this.requireTenantId();
    const rows: SiteRow[] = await this.dataSource.transaction((mgr) =>
      mgr.query(
        `UPDATE sites
            SET status = 'archived', archived_at = now(), updated_at = now()
          WHERE id = $1
      RETURNING id, tenant_id, country_id, code, name,
                ST_AsGeoJSON(gps_point) AS gps_point_geojson,
                iana_timezone, functional_currency, manager_user_id,
                capacity_t_per_day, status, archived_at, created_at, updated_at`,
        [id],
      ),
    );
    if (rows.length === 0) throw new NotFoundException(`Site ${id} not found.`);
    return this.toSiteResponse(rows[0]);
  }

  // ─── Zones ──────────────────────────────────────────────────────────────

  async createZone(dto: CreateZoneDto) {
    const tenantId = this.requireTenantId();
    try {
      const rows: ZoneRow[] = await this.dataSource.transaction((mgr) =>
        mgr.query(
          `INSERT INTO production_zones (tenant_id, site_id, code, name, geometry)
           VALUES ($1, $2, $3, $4, ST_GeomFromGeoJSON($5))
           RETURNING id, tenant_id, site_id, code, name,
                     ST_AsGeoJSON(geometry) AS geometry_geojson,
                     status, archived_at`,
          [tenantId, dto.siteId, dto.code, dto.name, JSON.stringify(dto.geometry)],
        ),
      );
      return this.toZoneResponse(rows[0]);
    } catch (error) {
      this.wrapUniqueViolation(error, 'zone code for this site');
    }
  }

  async listZones(siteId?: string) {
    this.requireTenantId();
    const rows: ZoneRow[] = await this.dataSource.transaction((mgr) =>
      siteId
        ? mgr.query(
            `SELECT id, tenant_id, site_id, code, name,
                    ST_AsGeoJSON(geometry) AS geometry_geojson,
                    status, archived_at
               FROM production_zones
              WHERE site_id = $1 AND archived_at IS NULL
              ORDER BY code`,
            [siteId],
          )
        : mgr.query(
            `SELECT id, tenant_id, site_id, code, name,
                    ST_AsGeoJSON(geometry) AS geometry_geojson,
                    status, archived_at
               FROM production_zones
              WHERE archived_at IS NULL
              ORDER BY code`,
          ),
    );
    return rows.map((r) => this.toZoneResponse(r));
  }

  async getZone(id: string) {
    this.requireTenantId();
    const rows: ZoneRow[] = await this.dataSource.transaction((mgr) =>
      mgr.query(
        `SELECT id, tenant_id, site_id, code, name,
                ST_AsGeoJSON(geometry) AS geometry_geojson, status, archived_at
           FROM production_zones WHERE id = $1`,
        [id],
      ),
    );
    if (rows.length === 0) throw new NotFoundException(`Zone ${id} not found.`);
    return this.toZoneResponse(rows[0]);
  }

  async updateZone(id: string, dto: UpdateZoneDto) {
    this.requireTenantId();
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (dto.name !== undefined) {
      sets.push(`name = $${i++}`);
      params.push(dto.name);
    }
    if (dto.geometry !== undefined) {
      sets.push(`geometry = ST_GeomFromGeoJSON($${i++})`);
      params.push(JSON.stringify(dto.geometry));
    }
    if (sets.length === 0) return this.getZone(id);
    params.push(id);
    const rows: ZoneRow[] = await this.dataSource.transaction((mgr) =>
      mgr.query(
        `UPDATE production_zones SET ${sets.join(', ')}, updated_at = now()
           WHERE id = $${i}
       RETURNING id, tenant_id, site_id, code, name,
                 ST_AsGeoJSON(geometry) AS geometry_geojson, status, archived_at`,
        params,
      ),
    );
    if (rows.length === 0) throw new NotFoundException(`Zone ${id} not found.`);
    return this.toZoneResponse(rows[0]);
  }

  async archiveZone(id: string) {
    this.requireTenantId();
    const rows: ZoneRow[] = await this.dataSource.transaction((mgr) =>
      mgr.query(
        `UPDATE production_zones
            SET status = 'archived', archived_at = now(), updated_at = now()
          WHERE id = $1
      RETURNING id, tenant_id, site_id, code, name,
                ST_AsGeoJSON(geometry) AS geometry_geojson, status, archived_at`,
        [id],
      ),
    );
    if (rows.length === 0) throw new NotFoundException(`Zone ${id} not found.`);
    return this.toZoneResponse(rows[0]);
  }

  // ─── Benches ────────────────────────────────────────────────────────────

  async createBench(dto: CreateBenchDto) {
    const tenantId = this.requireTenantId();
    try {
      const rows: BenchRow[] = await this.dataSource.transaction((mgr) =>
        mgr.query(
          `INSERT INTO benches (tenant_id, production_zone_id, code, name, geometry, elevation_m)
           VALUES ($1, $2, $3, $4, ST_GeomFromGeoJSON($5), $6)
           RETURNING id, tenant_id, production_zone_id, code, name,
                     ST_AsGeoJSON(geometry) AS geometry_geojson,
                     elevation_m, status, archived_at`,
          [
            tenantId,
            dto.productionZoneId,
            dto.code,
            dto.name,
            JSON.stringify(dto.geometry),
            dto.elevationM ?? null,
          ],
        ),
      );
      return this.toBenchResponse(rows[0]);
    } catch (error) {
      this.wrapUniqueViolation(error, 'bench code for this zone');
    }
  }

  async listBenches(zoneId?: string) {
    this.requireTenantId();
    const rows: BenchRow[] = await this.dataSource.transaction((mgr) =>
      zoneId
        ? mgr.query(
            `SELECT id, tenant_id, production_zone_id, code, name,
                    ST_AsGeoJSON(geometry) AS geometry_geojson,
                    elevation_m, status, archived_at
               FROM benches
              WHERE production_zone_id = $1 AND archived_at IS NULL
              ORDER BY code`,
            [zoneId],
          )
        : mgr.query(
            `SELECT id, tenant_id, production_zone_id, code, name,
                    ST_AsGeoJSON(geometry) AS geometry_geojson,
                    elevation_m, status, archived_at
               FROM benches
              WHERE archived_at IS NULL
              ORDER BY code`,
          ),
    );
    return rows.map((r) => this.toBenchResponse(r));
  }

  async getBench(id: string) {
    this.requireTenantId();
    const rows: BenchRow[] = await this.dataSource.transaction((mgr) =>
      mgr.query(
        `SELECT id, tenant_id, production_zone_id, code, name,
                ST_AsGeoJSON(geometry) AS geometry_geojson,
                elevation_m, status, archived_at
           FROM benches WHERE id = $1`,
        [id],
      ),
    );
    if (rows.length === 0) throw new NotFoundException(`Bench ${id} not found.`);
    return this.toBenchResponse(rows[0]);
  }

  async updateBench(id: string, dto: UpdateBenchDto) {
    this.requireTenantId();
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (dto.name !== undefined) {
      sets.push(`name = $${i++}`);
      params.push(dto.name);
    }
    if (dto.geometry !== undefined) {
      sets.push(`geometry = ST_GeomFromGeoJSON($${i++})`);
      params.push(JSON.stringify(dto.geometry));
    }
    if (dto.elevationM !== undefined) {
      sets.push(`elevation_m = $${i++}`);
      params.push(dto.elevationM);
    }
    if (sets.length === 0) return this.getBench(id);
    params.push(id);
    const rows: BenchRow[] = await this.dataSource.transaction((mgr) =>
      mgr.query(
        `UPDATE benches SET ${sets.join(', ')}, updated_at = now()
           WHERE id = $${i}
       RETURNING id, tenant_id, production_zone_id, code, name,
                 ST_AsGeoJSON(geometry) AS geometry_geojson,
                 elevation_m, status, archived_at`,
        params,
      ),
    );
    if (rows.length === 0) throw new NotFoundException(`Bench ${id} not found.`);
    return this.toBenchResponse(rows[0]);
  }

  async archiveBench(id: string) {
    this.requireTenantId();
    const rows: BenchRow[] = await this.dataSource.transaction((mgr) =>
      mgr.query(
        `UPDATE benches
            SET status = 'archived', archived_at = now(), updated_at = now()
          WHERE id = $1
      RETURNING id, tenant_id, production_zone_id, code, name,
                ST_AsGeoJSON(geometry) AS geometry_geojson,
                elevation_m, status, archived_at`,
        [id],
      ),
    );
    if (rows.length === 0) throw new NotFoundException(`Bench ${id} not found.`);
    return this.toBenchResponse(rows[0]);
  }

  // ─── Permits ────────────────────────────────────────────────────────────

  async createPermit(dto: CreatePermitDto) {
    if (dto.validFrom >= dto.validTo) {
      throw new BadRequestException('valid_from must be strictly before valid_to.');
    }
    const tenantId = this.requireTenantId();
    try {
      const rows: PermitRow[] = await this.dataSource.transaction((mgr) =>
        mgr.query(
          `INSERT INTO permits (tenant_id, site_id, type, authority, reference,
                                valid_from, valid_to, document_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, tenant_id, site_id, type, authority, reference,
                     valid_from, valid_to, document_url, status, archived_at`,
          [
            tenantId,
            dto.siteId,
            dto.type,
            dto.authority,
            dto.reference,
            dto.validFrom,
            dto.validTo,
            dto.documentUrl ?? null,
          ],
        ),
      );
      return this.toPermitResponse(rows[0]);
    } catch (error) {
      this.wrapUniqueViolation(error, 'permit reference for this site');
    }
  }

  async listPermits(siteId?: string) {
    this.requireTenantId();
    const rows: PermitRow[] = await this.dataSource.transaction((mgr) =>
      siteId
        ? mgr.query(
            `SELECT id, tenant_id, site_id, type, authority, reference,
                    valid_from, valid_to, document_url, status, archived_at
               FROM permits
              WHERE site_id = $1 AND archived_at IS NULL
              ORDER BY valid_from DESC`,
            [siteId],
          )
        : mgr.query(
            `SELECT id, tenant_id, site_id, type, authority, reference,
                    valid_from, valid_to, document_url, status, archived_at
               FROM permits
              WHERE archived_at IS NULL
              ORDER BY valid_from DESC`,
          ),
    );
    return rows.map((r) => this.toPermitResponse(r));
  }

  async getPermit(id: string) {
    this.requireTenantId();
    const rows: PermitRow[] = await this.dataSource.transaction((mgr) =>
      mgr.query(
        `SELECT id, tenant_id, site_id, type, authority, reference,
                valid_from, valid_to, document_url, status, archived_at
           FROM permits WHERE id = $1`,
        [id],
      ),
    );
    if (rows.length === 0) throw new NotFoundException(`Permit ${id} not found.`);
    return this.toPermitResponse(rows[0]);
  }

  async updatePermit(id: string, dto: UpdatePermitDto) {
    this.requireTenantId();
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (dto.authority !== undefined) {
      sets.push(`authority = $${i++}`);
      params.push(dto.authority);
    }
    if (dto.validFrom !== undefined) {
      sets.push(`valid_from = $${i++}`);
      params.push(dto.validFrom);
    }
    if (dto.validTo !== undefined) {
      sets.push(`valid_to = $${i++}`);
      params.push(dto.validTo);
    }
    if (dto.documentUrl !== undefined) {
      sets.push(`document_url = $${i++}`);
      params.push(dto.documentUrl);
    }
    if (sets.length === 0) return this.getPermit(id);
    params.push(id);
    const rows: PermitRow[] = await this.dataSource.transaction((mgr) =>
      mgr.query(
        `UPDATE permits SET ${sets.join(', ')}, updated_at = now()
           WHERE id = $${i}
       RETURNING id, tenant_id, site_id, type, authority, reference,
                 valid_from, valid_to, document_url, status, archived_at`,
        params,
      ),
    );
    if (rows.length === 0) throw new NotFoundException(`Permit ${id} not found.`);
    return this.toPermitResponse(rows[0]);
  }

  async archivePermit(id: string) {
    this.requireTenantId();
    const rows: PermitRow[] = await this.dataSource.transaction((mgr) =>
      mgr.query(
        `UPDATE permits
            SET status = 'archived', archived_at = now(), updated_at = now()
          WHERE id = $1
      RETURNING id, tenant_id, site_id, type, authority, reference,
                valid_from, valid_to, document_url, status, archived_at`,
        [id],
      ),
    );
    if (rows.length === 0) throw new NotFoundException(`Permit ${id} not found.`);
    return this.toPermitResponse(rows[0]);
  }

  // ─── Activity Log (read projection) ─────────────────────────────────────

  async listActivityLog(filter: { siteId?: string; from?: string; to?: string }) {
    this.requireTenantId();
    const params: unknown[] = [];
    const conds: string[] = [];
    if (filter.siteId) {
      params.push(filter.siteId);
      conds.push(`site_id = $${params.length}`);
    }
    if (filter.from) {
      params.push(filter.from);
      conds.push(`business_date >= $${params.length}`);
    }
    if (filter.to) {
      params.push(filter.to);
      conds.push(`business_date <= $${params.length}`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    return this.dataSource.transaction(async (mgr) => {
      try {
        return await mgr.query(
          `SELECT id, tenant_id, site_id, business_date, shift_id, author_user_id,
                  notes, photo_url, created_at
             FROM daily_activity_log
             ${where}
             ORDER BY business_date DESC, created_at DESC
             LIMIT 200`,
          params,
        );
      } catch {
        // W2-P03 may not have deployed the table yet — fail soft.
        return [] as unknown[];
      }
    });
  }

  // ─── Attachments (presign) ──────────────────────────────────────────────

  /**
   * Per D-29 (content-addressed immutable storage): the object key is the
   * SHA-256 of the file content. Two uploads of the same bytes naturally
   * dedupe to the same key, and the artifact can never be silently mutated.
   *
   * The actual presigned URL backend (S3, MinIO) is wired in a later phase.
   * For Phase 1 we return a deterministic stub URL keyed by the hash so the
   * front-end + e2e tests can exercise the full flow.
   */
  async presignAttachment(dto: AttachmentPresignDto) {
    const tenantId = this.requireTenantId();
    const objectKey = `sha256-${dto.sha256}`;
    const bucket = `gravel-${tenantId}-permits`;
    return {
      objectKey,
      bucket,
      uploadUrl: `s3://${bucket}/${objectKey}?presign=phase1-stub`,
      method: 'PUT' as const,
      headers: { 'content-type': dto.mime },
      contentAddressed: true,
    };
  }
}
