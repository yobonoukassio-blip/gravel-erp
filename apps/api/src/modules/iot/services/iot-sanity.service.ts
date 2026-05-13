import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { IotReadingRaw } from '../entities/iot-reading-raw.entity';
import { IotReadingValidated } from '../entities/iot-reading-validated.entity';

interface SensorRange {
  min: number;
  max: number;
  unit: string;
}

const SENSOR_RANGES: Record<string, SensorRange> = {
  gps_speed_kmh: { min: 0, max: 130, unit: 'km/h' },
  fuel_level_pct: { min: 0, max: 100, unit: '%' },
  fuel_level_litres: { min: 0, max: 100_000, unit: 'L' },
  engine_temp_c: { min: -20, max: 130, unit: '°C' },
  crusher_vibration_mm_s: { min: 0, max: 50, unit: 'mm/s' },
  ambient_temp_c: { min: -20, max: 60, unit: '°C' },
};

/**
 * IotSanityService (IOT-04).
 *
 * Validates a raw reading against sensor-type-specific ranges and converts
 * it into a typed validated row. Anything outside range becomes 'invalid'
 * with a reason, but still gets stored — business KPIs filter on
 * data_quality_flag='valid'.
 */
@Injectable()
export class IotSanityService {
  private readonly logger = new Logger(IotSanityService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async validateReading(raw: IotReadingRaw): Promise<IotReadingValidated> {
    const range = SENSOR_RANGES[raw.sensorType];
    const numericValue = this.extractNumeric(raw.payload);

    let flag: 'valid' | 'invalid' | 'suspect' = 'valid';
    let invalidReason: string | null = null;

    if (numericValue == null) {
      flag = 'invalid';
      invalidReason = 'NO_NUMERIC_VALUE';
    } else if (range && (numericValue < range.min || numericValue > range.max)) {
      flag = 'invalid';
      invalidReason = `OUT_OF_RANGE: ${numericValue} not in [${range.min}, ${range.max}] ${range.unit}`;
    } else if (range && (numericValue === range.min || numericValue === range.max)) {
      flag = 'suspect';
      invalidReason = 'EXACT_BOUNDARY_VALUE';
    }

    const validated: Partial<IotReadingValidated> = {
      rawId: raw.id,
      tenantId: raw.tenantId,
      siteId: raw.siteId,
      deviceId: raw.deviceId,
      sensorType: raw.sensorType,
      value: numericValue != null ? numericValue.toFixed(4) : null,
      unit: range?.unit ?? null,
      latitude: this.extractCoord(raw.payload, 'lat'),
      longitude: this.extractCoord(raw.payload, 'lon'),
      observedAtUtc: raw.observedAtUtc,
      dataQualityFlag: flag,
      invalidReason,
    };

    const saved = await this.ds.getRepository(IotReadingValidated).save(validated);

    // Update raw row's data_quality_flag for symmetry
    await this.ds
      .getRepository(IotReadingRaw)
      .update({ id: raw.id }, { dataQualityFlag: flag });

    return saved;
  }

  private extractNumeric(payload: Record<string, unknown>): number | null {
    for (const key of ['value', 'val', 'level', 'speed', 'temp']) {
      const v = payload[key];
      if (typeof v === 'number' && Number.isFinite(v)) return v;
    }
    return null;
  }

  private extractCoord(payload: Record<string, unknown>, kind: 'lat' | 'lon'): string | null {
    const key = kind === 'lat' ? 'latitude' : 'longitude';
    const v = payload[key] ?? payload[kind];
    return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(6) : null;
  }
}
