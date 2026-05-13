import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FxRateSnapshot } from '../entities/fx-rate-snapshot.entity';

/**
 * FxRateSnapshotService — FX rates frozen at a given date.
 *
 * snapshot() uses INSERT ... ON CONFLICT DO NOTHING → once a rate is set for a
 * (tenant, currency_from, currency_to, date), it can NEVER be overwritten.
 * This is critical for W3-P06 invoice generation, which depends on immutable
 * rates at delivery_date.
 */
@Injectable()
export class FxRateSnapshotService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async snapshot(params: {
    tenantId: string;
    currencyFrom: string;
    currencyTo: string;
    rate: number;
    snapshotDate: string;
    source: string;
  }): Promise<void> {
    await this.ds
      .createQueryBuilder()
      .insert()
      .into(FxRateSnapshot)
      .values({
        tenantId: params.tenantId,
        currencyFrom: params.currencyFrom,
        currencyTo: params.currencyTo,
        rate: params.rate.toFixed(8),
        snapshotDate: params.snapshotDate,
        source: params.source,
      })
      .orIgnore() // ON CONFLICT DO NOTHING — immutable
      .execute();
  }

  async findForDate(params: {
    tenantId: string;
    currencyFrom: string;
    currencyTo: string;
    snapshotDate: string;
  }): Promise<FxRateSnapshot | null> {
    return this.ds.getRepository(FxRateSnapshot).findOne({
      where: {
        tenantId: params.tenantId,
        currencyFrom: params.currencyFrom,
        currencyTo: params.currencyTo,
        snapshotDate: params.snapshotDate,
      },
    });
  }

  async listMissingForDates(params: {
    tenantId: string;
    currencyFrom: string;
    currencyTo: string;
    dates: string[];
  }): Promise<string[]> {
    if (params.dates.length === 0) return [];
    const found = await this.ds.getRepository(FxRateSnapshot).find({
      where: {
        tenantId: params.tenantId,
        currencyFrom: params.currencyFrom,
        currencyTo: params.currencyTo,
      },
    });
    const present = new Set(found.map((r) => r.snapshotDate));
    return params.dates.filter((d) => !present.has(d));
  }
}
