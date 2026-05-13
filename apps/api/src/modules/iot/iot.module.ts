import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IotReadingRaw } from './entities/iot-reading-raw.entity';
import { IotReadingValidated } from './entities/iot-reading-validated.entity';
import { IotIngestionService } from './services/iot-ingestion.service';
import { IotSanityService } from './services/iot-sanity.service';
import { FuelReconciliationIotService } from './services/fuel-reconciliation-iot.service';

/**
 * IotModule (Phase 5).
 *
 * 3-layer model:
 *   - RAW (IOT-01): untouched ingestion, TimescaleDB hypertable when available
 *   - VALIDATED (IOT-04): sanity-checked with data_quality_flag
 *   - BUSINESS: existing operational tables (fuel, transport) consume validated readings
 *
 * Edge gateway buffer (IOT-01) bulk ingestion supported via ingestBulk().
 * Telematics ingestion (IOT-02): MQTT bridge wired in infra layer.
 * Fuel IoT reconciliation (IOT-03): manual vs IoT delta with drift thresholds.
 */
@Module({
  imports: [TypeOrmModule.forFeature([IotReadingRaw, IotReadingValidated])],
  providers: [IotIngestionService, IotSanityService, FuelReconciliationIotService],
  exports: [IotIngestionService, IotSanityService, FuelReconciliationIotService],
})
export class IotModule {}
