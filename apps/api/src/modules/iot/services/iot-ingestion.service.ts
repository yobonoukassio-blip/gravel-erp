import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { IotReadingRaw } from '../entities/iot-reading-raw.entity';
import { IotSanityService } from './iot-sanity.service';

interface IngestPayload {
  tenantId: string;
  siteId?: string;
  deviceId: string;
  sensorType: string;
  payload: Record<string, unknown>;
  observedAtUtc: string;
}

/**
 * IotIngestionService (IOT-01, IOT-02, IOT-03).
 *
 * Entry point for MQTT/HTTP gateway forwarding. Lands raw rows, then triggers
 * sanity validation asynchronously. Bulk ingest API supports edge gateway
 * backfill after WAN reconnection (IOT-01 7-day buffer requirement).
 */
@Injectable()
export class IotIngestionService {
  private readonly logger = new Logger(IotIngestionService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly sanity: IotSanityService,
  ) {}

  async ingest(payload: IngestPayload): Promise<IotReadingRaw> {
    const row = this.ds.getRepository(IotReadingRaw).create({
      tenantId: payload.tenantId,
      siteId: payload.siteId ?? null,
      deviceId: payload.deviceId,
      sensorType: payload.sensorType,
      payload: payload.payload,
      observedAtUtc: new Date(payload.observedAtUtc),
      dataQualityFlag: 'unvalidated',
    });
    const saved = await this.ds.getRepository(IotReadingRaw).save(row);

    // Validate inline — for high throughput, switch to BullMQ background job
    try {
      await this.sanity.validateReading(saved);
    } catch (err) {
      this.logger.error(`sanity validation failed for ${saved.id}: ${(err as Error).message}`);
    }

    return saved;
  }

  /** Bulk ingest from edge gateway buffered backfill. */
  async ingestBulk(payloads: IngestPayload[]): Promise<number> {
    let count = 0;
    for (const p of payloads) {
      try {
        await this.ingest(p);
        count++;
      } catch (err) {
        this.logger.error(
          `bulk ingest skip ${p.deviceId}@${p.observedAtUtc}: ${(err as Error).message}`,
        );
      }
    }
    return count;
  }
}
