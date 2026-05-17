import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * FxRateService (FND-07).
 *
 * Resolves the foreign-exchange rate for a (tenant, date, from→to) tuple
 * from the `fx_rate` reference table (created by migration
 * 1718200000000__fnd07_three_rep_money.sql). Falls back to rate=1.0 when:
 *   - from === to (no conversion needed)
 *   - no rate is configured for the date (logs a warning, returns identity)
 *
 * The fallback is intentional: writers must keep producing rows even when
 * fx_rate is not yet seeded for a given period. Operations can backfill the
 * table later; the entry's `fx_rate_id = null` signals "treated as identity".
 *
 * Conversion math is integer-bigint to preserve precision:
 *   converted_minor = round(amount_minor * rate)
 * where `rate` is a NUMERIC(18,8) → we scale by 1e8 and divide.
 */
@Injectable()
export class FxRateService {
  private readonly logger = new Logger(FxRateService.name);
  private readonly cache = new Map<string, { id: string; rate: number } | null>();

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /**
   * Convert `amountMinor` from `fromCurrency` to `toCurrency` using the
   * tenant's fx_rate snapshot for `rateDate`. Returns:
   *   { convertedMinor, fxRateId }
   * fxRateId is null when no conversion was applied (same currency OR no
   * rate found for the date — identity fallback).
   */
  async convert(args: {
    tenantId: string;
    rateDate: string; // YYYY-MM-DD
    fromCurrency: string;
    toCurrency: string;
    amountMinor: bigint;
  }): Promise<{ convertedMinor: bigint; fxRateId: string | null }> {
    if (args.fromCurrency === args.toCurrency) {
      return { convertedMinor: args.amountMinor, fxRateId: null };
    }
    const fx = await this.findRate(
      args.tenantId,
      args.rateDate,
      args.fromCurrency,
      args.toCurrency,
    );
    if (!fx) {
      this.logger.warn(
        `[FxRate] no rate for tenant=${args.tenantId} date=${args.rateDate} ${args.fromCurrency}→${args.toCurrency}; using identity`,
      );
      return { convertedMinor: args.amountMinor, fxRateId: null };
    }
    // rate * 1e8 → keep precision, then divide back
    const scaled = BigInt(Math.round(fx.rate * 1e8));
    const convertedMinor = (args.amountMinor * scaled) / 100_000_000n;
    return { convertedMinor, fxRateId: fx.id };
  }

  private cacheKey(tenantId: string, date: string, from: string, to: string): string {
    return `${tenantId}|${date}|${from}|${to}`;
  }

  private async findRate(
    tenantId: string,
    rateDate: string,
    fromCurrency: string,
    toCurrency: string,
  ): Promise<{ id: string; rate: number } | null> {
    const key = this.cacheKey(tenantId, rateDate, fromCurrency, toCurrency);
    if (this.cache.has(key)) return this.cache.get(key)!;

    const rows = await this.ds.query<Array<{ id: string; rate: string }>>(
      `SELECT id, rate::text AS rate
         FROM fx_rate
        WHERE tenant_id = $1
          AND rate_date = $2
          AND from_currency = $3
          AND to_currency = $4
        LIMIT 1`,
      [tenantId, rateDate, fromCurrency, toCurrency],
    );
    const found = rows.length > 0 ? { id: rows[0].id, rate: Number(rows[0].rate) } : null;
    this.cache.set(key, found);
    return found;
  }

  /**
   * Clear the in-memory cache. Call from a daily @Cron when fx_rate is
   * refreshed, or in tests between cases.
   */
  invalidateCache(): void {
    this.cache.clear();
  }
}
