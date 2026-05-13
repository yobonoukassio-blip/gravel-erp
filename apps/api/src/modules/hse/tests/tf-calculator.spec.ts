/**
 * TfCalculatorService unit tests (HSE-06).
 *
 * Tests:
 *   1. 200 op-days × 50 headcount × 8h = 80 000h + 4 lost-time incidents → TF = 50
 *   2. < 12 months window → mode = 'since_launch'
 *   3. Zero hours → TF = 0 (no division by zero)
 *   4. No lost-time incidents → TF = 0
 *
 * Run: pnpm --filter=@gravel/api test tf-calculator
 */

import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import {
  TfCalculatorService,
  TF_NORMALIZATION_FACTOR,
  HOURS_PER_WORKER_PER_DAY,
} from '../services/tf-calculator.service';

// ---------------------------------------------------------------------------
// Helpers to build mock DataSource
// ---------------------------------------------------------------------------

interface MockQuery {
  (sql: string, params: unknown[]): unknown[];
}

function buildMockDataSource(queryFn: MockQuery) {
  return {
    query: jest.fn(async (sql: string, params: unknown[]) => queryFn(sql, params)),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TfCalculatorService', () => {
  let service: TfCalculatorService;

  const tenantId = randomUUID();
  const siteId = randomUUID();

  async function build(queryFn: MockQuery): Promise<TfCalculatorService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TfCalculatorService,
        {
          provide: getDataSourceToken(),
          useValue: buildMockDataSource(queryFn),
        },
      ],
    }).compile();
    return module.get(TfCalculatorService);
  }

  describe('canonical TF = 50 calculation', () => {
    it('computes TF = 50 for 200 days × 50 headcount × 8h + 4 lost-time accidents', async () => {
      /**
       * Setup:
       *   workforce_headcount = 50 per day
       *   200 operational_days → hours_worked = 200 × 50 × 8 = 80 000 hours
       *   4 incidents with lost_time_h > 0
       *   TF = (4 × 1 000 000) / 80 000 = 50
       */
      const headcount = 50;
      const days = 200;
      const totalHours = days * headcount * HOURS_PER_WORKER_PER_DAY;
      const accidentsWithLostTime = 4;
      const expectedTf = (accidentsWithLostTime * TF_NORMALIZATION_FACTOR) / totalHours;
      expect(expectedTf).toBe(50);

      // Mock launchDate far enough back to trigger rolling_12m mode.
      const periodEnd = new Date('2026-05-01');
      const launchDate = new Date('2025-04-01'); // 13 months ago

      service = await build((sql, _params) => {
        if (sql.includes('MIN(day_date)')) {
          return [{ launch_date: launchDate.toISOString().slice(0, 10) }];
        }
        if (sql.includes('SUM(workforce_headcount')) {
          return [{ total_hours: String(totalHours) }];
        }
        if (sql.includes('COUNT(*)') && sql.includes('hse_incident')) {
          return [{ cnt: String(accidentsWithLostTime) }];
        }
        return [{}];
      });

      const result = await service.compute(siteId, tenantId, periodEnd);

      expect(result.tf).toBe(50);
      expect(result.hours_worked).toBe(totalHours);
      expect(result.accidents_with_lost_time).toBe(accidentsWithLostTime);
      expect(result.mode).toBe('rolling_12m');
      expect(result.tf_rolling_12_months).toBe(50);
      expect(result.tf_since_launch).toBeUndefined();
    });
  });

  describe('mode = since_launch when < 365 days available', () => {
    it('returns mode=since_launch and tf_since_launch for short history', async () => {
      const periodEnd = new Date('2026-05-01');
      const launchDate = new Date('2026-03-01'); // only ~60 days ago
      const totalHours = 60 * 30 * HOURS_PER_WORKER_PER_DAY;
      const accidentsWithLostTime = 2;

      service = await build((sql, _params) => {
        if (sql.includes('MIN(day_date)')) {
          return [{ launch_date: launchDate.toISOString().slice(0, 10) }];
        }
        if (sql.includes('SUM(workforce_headcount')) {
          return [{ total_hours: String(totalHours) }];
        }
        if (sql.includes('COUNT(*)') && sql.includes('hse_incident')) {
          return [{ cnt: String(accidentsWithLostTime) }];
        }
        return [{}];
      });

      const result = await service.compute(siteId, tenantId, periodEnd);

      expect(result.mode).toBe('since_launch');
      expect(result.tf_since_launch).toBeDefined();
      expect(result.tf_rolling_12_months).toBeUndefined();
      expect(result.note).toContain('fenêtre 12 mois');
    });
  });

  describe('edge cases', () => {
    it('returns TF = 0 when hours_worked = 0', async () => {
      service = await build((sql, _params) => {
        if (sql.includes('MIN(day_date)')) {
          return [{ launch_date: null }];
        }
        if (sql.includes('SUM(workforce_headcount')) {
          return [{ total_hours: '0' }];
        }
        if (sql.includes('COUNT(*)') && sql.includes('hse_incident')) {
          return [{ cnt: '0' }];
        }
        return [{}];
      });

      const result = await service.compute(siteId, tenantId);
      expect(result.tf).toBe(0);
      expect(result.hours_worked).toBe(0);
    });

    it('returns TF = 0 when no lost-time incidents', async () => {
      const launchDate = new Date('2025-04-01');

      service = await build((sql, _params) => {
        if (sql.includes('MIN(day_date)')) {
          return [{ launch_date: launchDate.toISOString().slice(0, 10) }];
        }
        if (sql.includes('SUM(workforce_headcount')) {
          return [{ total_hours: '80000' }];
        }
        if (sql.includes('COUNT(*)') && sql.includes('hse_incident')) {
          return [{ cnt: '0' }]; // no lost-time incidents
        }
        return [{}];
      });

      const result = await service.compute(siteId, tenantId);
      expect(result.tf).toBe(0);
      expect(result.accidents_with_lost_time).toBe(0);
    });

    it('confirms normalization factor is 1_000_000', () => {
      expect(TF_NORMALIZATION_FACTOR).toBe(1_000_000);
    });

    it('confirms hours-per-worker-per-day is 8', () => {
      expect(HOURS_PER_WORKER_PER_DAY).toBe(8);
    });
  });
});
