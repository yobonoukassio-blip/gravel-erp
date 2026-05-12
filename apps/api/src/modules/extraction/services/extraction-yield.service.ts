import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExtractionCycle } from '../entities/extraction-cycle.entity';

export interface YieldRow {
  equipment_id: string;
  operator_id: string;
  total_estimated_t: number;
  productive_hours: number;
  yield_t_per_h: number;
  cycle_count: number;
}

/**
 * ExtractionYieldService (EXT-02, D2-20).
 *
 * Rendement = sum(estimated_tonnage_t) / productive_hours
 *   productive_hours = sum((ended - started) - downtime_minutes) converted to hours.
 *
 * Per D2-21: yield is an *operational* KPI based on estimated tonnage. It is
 * NOT a financial value. Stockpile valuation uses weighing tickets (W2-P04).
 */
@Injectable()
export class ExtractionYieldService {
  constructor(
    @InjectRepository(ExtractionCycle)
    private readonly repo: Repository<ExtractionCycle>,
  ) {}

  async computeYield(
    tenantId: string,
    operationalDayId: string,
  ): Promise<YieldRow[]> {
    const rows = await this.repo.find({
      where: { tenantId, operationalDayId },
      order: { equipmentId: 'ASC', operatorId: 'ASC' },
    });
    return this.aggregate(rows);
  }

  /**
   * Pure aggregation — exposed for unit testing without a DB connection.
   */
  aggregate(rows: ExtractionCycle[]): YieldRow[] {
    const buckets = new Map<
      string,
      {
        equipment_id: string;
        operator_id: string;
        total_estimated_t: number;
        productive_minutes: number;
        cycle_count: number;
      }
    >();

    for (const row of rows) {
      const key = `${row.equipmentId}::${row.operatorId}`;
      const elapsedMinutes =
        (row.cycleEndedAtLocal.getTime() -
          row.cycleStartedAtLocal.getTime()) /
        60000;
      const downtime = row.downtimeMinutes ?? 0;
      const productiveMinutes = Math.max(0, elapsedMinutes - downtime);

      const existing = buckets.get(key);
      if (existing) {
        existing.total_estimated_t += Number(row.estimatedTonnageT);
        existing.productive_minutes += productiveMinutes;
        existing.cycle_count += 1;
      } else {
        buckets.set(key, {
          equipment_id: row.equipmentId,
          operator_id: row.operatorId,
          total_estimated_t: Number(row.estimatedTonnageT),
          productive_minutes: productiveMinutes,
          cycle_count: 1,
        });
      }
    }

    const out: YieldRow[] = [];
    for (const b of buckets.values()) {
      const productiveHours = b.productive_minutes / 60;
      const yieldTPerH =
        productiveHours > 0 ? b.total_estimated_t / productiveHours : 0;
      out.push({
        equipment_id: b.equipment_id,
        operator_id: b.operator_id,
        total_estimated_t: round1(b.total_estimated_t),
        productive_hours: round2(productiveHours),
        yield_t_per_h: round2(yieldTPerH),
        cycle_count: b.cycle_count,
      });
    }
    return out;
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
