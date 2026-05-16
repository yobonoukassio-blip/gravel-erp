import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { IotIngestionService } from '../services/iot-ingestion.service';
import { FuelReconciliationIotService } from '../services/fuel-reconciliation-iot.service';

interface AuthedRequest {
  user: { userId: string; tenantId: string; roles?: string[] };
}

interface IngestDto {
  siteId?: string;
  deviceId: string;
  sensorType: string;
  payload: Record<string, unknown>;
  observedAtUtc: string;
}

/** IoT REST endpoints (Phase 5). */
@Controller('iot')
export class IotController {
  constructor(
    private readonly ingestion: IotIngestionService,
    private readonly fuelRecon: FuelReconciliationIotService,
  ) {}

  @Post('ingest')
  async ingest(@Body() dto: IngestDto, @Req() req: AuthedRequest) {
    return this.ingestion.ingest({
      tenantId: req.user.tenantId,
      siteId: dto.siteId,
      deviceId: dto.deviceId,
      sensorType: dto.sensorType,
      payload: dto.payload,
      observedAtUtc: dto.observedAtUtc,
    });
  }

  @Post('ingest/bulk')
  async ingestBulk(@Body() body: { readings: IngestDto[] }, @Req() req: AuthedRequest) {
    const enriched = body.readings.map((r) => ({
      tenantId: req.user.tenantId,
      ...r,
    }));
    const count = await this.ingestion.ingestBulk(enriched);
    return { ingested: count, total: body.readings.length };
  }

  @Get('fuel-reconciliation')
  async fuelReconciliation(
    @Query('siteId') siteId: string,
    @Query('date') date: string,
    @Req() req: AuthedRequest,
  ) {
    return this.fuelRecon.reconcileForDate({
      tenantId: req.user.tenantId,
      siteId,
      date,
    });
  }
}
