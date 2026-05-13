import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { SiteParam, SiteScopeGuard } from '../../common/guards/site-scope.guard';
import { Role, RoleGuard } from '../identity/role.decorator';
import { MasterDataService } from './master-data.service';
import { CreateSiteDto, ListSitesQuery, UpdateSiteDto } from './dto/site.dto';
import { CreateZoneDto, UpdateZoneDto } from './dto/zone.dto';
import { CreateBenchDto, UpdateBenchDto } from './dto/bench.dto';
import {
  AttachmentPresignDto,
  CreatePermitDto,
  UpdatePermitDto,
} from './dto/permit.dto';

/**
 * Master-data REST surface (D-23..D-26, D-29).
 *
 * - Soft-delete only: PATCH `/:id/archive`. No `@Delete` decorator anywhere.
 * - Tenant + role + site-scope guards run on every request.
 * - All geometry I/O is GeoJSON; the service does ST_AsGeoJSON / ST_GeomFromGeoJSON
 *   under the hood.
 */
@UseGuards(JwtAuthGuard, TenantGuard, RoleGuard)
@Controller('')
export class MasterDataController {
  constructor(private readonly md: MasterDataService) {}

  // ─── Sites ──────────────────────────────────────────────────────────────

  @Post('sites')
  @Role('DIRECTION_GROUPE', 'DIRECTEUR_SITE')
  @HttpCode(201)
  createSite(@Body() dto: CreateSiteDto) {
    return this.md.createSite(dto);
  }

  @Get('sites')
  @Role('DIRECTION_GROUPE', 'DIRECTEUR_SITE', 'CHEF_CARRIERE', 'HSE', 'MAINTENANCE', 'FINANCE')
  listSites(@Query() query: ListSitesQuery) {
    return this.md.listSites(query);
  }

  @Get('sites/:siteId')
  @UseGuards(SiteScopeGuard)
  @SiteParam('siteId')
  @Role('DIRECTION_GROUPE', 'DIRECTEUR_SITE', 'CHEF_CARRIERE', 'HSE', 'MAINTENANCE', 'FINANCE')
  getSite(@Param('siteId', new ParseUUIDPipe()) id: string) {
    return this.md.getSite(id);
  }

  @Patch('sites/:siteId')
  @UseGuards(SiteScopeGuard)
  @SiteParam('siteId')
  @Role('DIRECTION_GROUPE', 'DIRECTEUR_SITE')
  updateSite(
    @Param('siteId', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSiteDto,
  ) {
    return this.md.updateSite(id, dto);
  }

  @Patch('sites/:siteId/archive')
  @UseGuards(SiteScopeGuard)
  @SiteParam('siteId')
  @Role('DIRECTION_GROUPE', 'DIRECTEUR_SITE')
  archiveSite(@Param('siteId', new ParseUUIDPipe()) id: string) {
    return this.md.archiveSite(id);
  }

  // ─── Zones ──────────────────────────────────────────────────────────────

  @Post('zones')
  @Role('DIRECTION_GROUPE', 'DIRECTEUR_SITE')
  @HttpCode(201)
  createZone(@Body() dto: CreateZoneDto) {
    return this.md.createZone(dto);
  }

  @Get('zones')
  @Role('DIRECTION_GROUPE', 'DIRECTEUR_SITE', 'CHEF_CARRIERE', 'HSE', 'MAINTENANCE')
  listZones(@Query('siteId') siteId?: string) {
    return this.md.listZones(siteId);
  }

  @Get('zones/:id')
  @Role('DIRECTION_GROUPE', 'DIRECTEUR_SITE', 'CHEF_CARRIERE', 'HSE', 'MAINTENANCE')
  getZone(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.md.getZone(id);
  }

  @Patch('zones/:id')
  @Role('DIRECTION_GROUPE', 'DIRECTEUR_SITE')
  updateZone(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateZoneDto,
  ) {
    return this.md.updateZone(id, dto);
  }

  @Patch('zones/:id/archive')
  @Role('DIRECTION_GROUPE', 'DIRECTEUR_SITE')
  archiveZone(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.md.archiveZone(id);
  }

  // ─── Benches ────────────────────────────────────────────────────────────

  @Post('benches')
  @Role('DIRECTION_GROUPE', 'DIRECTEUR_SITE', 'CHEF_CARRIERE')
  @HttpCode(201)
  createBench(@Body() dto: CreateBenchDto) {
    return this.md.createBench(dto);
  }

  @Get('benches')
  @Role('DIRECTION_GROUPE', 'DIRECTEUR_SITE', 'CHEF_CARRIERE', 'HSE', 'MAINTENANCE')
  listBenches(@Query('zoneId') zoneId?: string) {
    return this.md.listBenches(zoneId);
  }

  @Get('benches/:id')
  @Role('DIRECTION_GROUPE', 'DIRECTEUR_SITE', 'CHEF_CARRIERE', 'HSE', 'MAINTENANCE')
  getBench(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.md.getBench(id);
  }

  @Patch('benches/:id')
  @Role('DIRECTION_GROUPE', 'DIRECTEUR_SITE', 'CHEF_CARRIERE')
  updateBench(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateBenchDto,
  ) {
    return this.md.updateBench(id, dto);
  }

  @Patch('benches/:id/archive')
  @Role('DIRECTION_GROUPE', 'DIRECTEUR_SITE')
  archiveBench(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.md.archiveBench(id);
  }

  // ─── Permits ────────────────────────────────────────────────────────────

  @Post('permits')
  @Role('DIRECTION_GROUPE', 'DIRECTEUR_SITE', 'HSE')
  @HttpCode(201)
  createPermit(@Body() dto: CreatePermitDto) {
    return this.md.createPermit(dto);
  }

  @Get('permits')
  @Role('DIRECTION_GROUPE', 'DIRECTEUR_SITE', 'HSE', 'CHEF_CARRIERE')
  listPermits(@Query('siteId') siteId?: string) {
    return this.md.listPermits(siteId);
  }

  @Get('permits/:id')
  @Role('DIRECTION_GROUPE', 'DIRECTEUR_SITE', 'HSE', 'CHEF_CARRIERE')
  getPermit(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.md.getPermit(id);
  }

  @Patch('permits/:id')
  @Role('DIRECTION_GROUPE', 'DIRECTEUR_SITE', 'HSE')
  updatePermit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePermitDto,
  ) {
    return this.md.updatePermit(id, dto);
  }

  @Patch('permits/:id/archive')
  @Role('DIRECTION_GROUPE', 'DIRECTEUR_SITE', 'HSE')
  archivePermit(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.md.archivePermit(id);
  }

  // ─── Attachments ───────────────────────────────────────────────────────

  @Post('attachments')
  @Role('DIRECTION_GROUPE', 'DIRECTEUR_SITE', 'HSE')
  @HttpCode(201)
  presignAttachment(@Body() dto: AttachmentPresignDto) {
    return this.md.presignAttachment(dto);
  }

  // ─── Activity Log (read-only feed for /activity-log UI) ────────────────
  // The journal d'activité quotidien is materialised by plan W2-P03's sync
  // pipeline into `daily_activity_log`. The web UI consumes a read-only
  // projection here. Write path stays on the mobile/sync side.

  @Get('activity-log')
  @Role('DIRECTION_GROUPE', 'DIRECTEUR_SITE')
  listActivityLog(
    @Query('siteId') siteId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.md.listActivityLog({ siteId, from, to });
  }
}
