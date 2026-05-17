import { DashboardAggregatorService } from '../services/dashboard-aggregator.service';
import { CostPerTonProvisionalService } from '../services/cost-per-ton-provisional.service';

/**
 * DashboardAggregatorService unit tests (DSH-01, DSH-02).
 *
 * Seeds:
 *   - 1 site with 100 drilled holes
 *   - 5 truck rotations totaling 50 t inflow
 *   - 2 fuel refuels totaling 800 L
 *   - 1 open incident severity 'critical'
 */
describe('DashboardAggregatorService', () => {
  const TENANT = 'tenant-1';
  const SITE = 'site-1';
  const DAY = 'day-1';

  let service: DashboardAggregatorService;
  let mockDs: { query: jest.Mock };
  let mockCostPerTon: { compute: jest.Mock };

  beforeEach(() => {
    mockDs = { query: jest.fn() };
    mockCostPerTon = { compute: jest.fn() };
    service = new DashboardAggregatorService(
      mockDs as never,
      mockCostPerTon as unknown as CostPerTonProvisionalService,
      {} as never,
    );
  });

  describe('computeForSiteDirector', () => {
    it('returns full Site Director payload shape with cost_per_ton_provisional', async () => {
      // Mock all 9 parallel calls in order
      // 1) tonnage today
      mockDs.query.mockResolvedValueOnce([{ total: '50000000' }]); // 50 000 kg today
      // 2) tonnage yesterday
      mockDs.query.mockResolvedValueOnce([{ total: '45000000' }]);
      // 3) tonnage week
      mockDs.query.mockResolvedValueOnce([{ total: '300000000' }]);
      // 4) tonnage month
      mockDs.query.mockResolvedValueOnce([{ total: '1200000000' }]);
      // 5) drilling yield
      mockDs.query.mockResolvedValueOnce([{ avg_yield: 12.5 }]);
      // 6) extraction yield
      mockDs.query.mockResolvedValueOnce([{ total_t: 200, total_h: 8 }]);
      // 7) TF query
      mockDs.query.mockResolvedValueOnce([{ incidents: 1, worked_hours: 2000 }]);
      // 8) open incidents
      mockDs.query.mockResolvedValueOnce([
        { severity: 'critical', count: 1 },
      ]);
      // 9) fuel tanks
      mockDs.query.mockResolvedValueOnce([
        { tank_id: 'tank-1', label: 'Cuve A', balance_liters: 2000, capacity_liters: 5000, pct_filled: 40, anomalies_open: 0 },
      ]);
      // 10) stockpiles
      mockDs.query.mockResolvedValueOnce([
        { stockpile_id: 'sp-1', label: 'Stockpile 0/31.5', balance_kg: '500000', threshold_status: 'ok' },
      ]);
      // 11) equipment out of service
      mockDs.query.mockResolvedValueOnce([]);

      // cost per ton (separate service mock)
      mockCostPerTon.compute.mockResolvedValueOnce({
        amount_minor: 8000n,
        currency: 'XOF',
        label: 'cost_per_ton_provisional',
      });

      const result = await service.computeForSiteDirector(TENANT, SITE, DAY);

      // Tonnage assertions
      expect(result.tonnage_today_kg).toBe(50000000n);
      expect(result.tonnage_yesterday_kg).toBe(45000000n);
      expect(result.tonnage_week_kg).toBe(300000000n);
      expect(result.tonnage_month_kg).toBe(1200000000n);

      // KPI assertions
      expect(result.drilling_yield_m_per_h_today).toBe(12.5);
      expect(result.extraction_yield_t_per_h_today).toBe(25); // 200/8

      // TF = 1 / 2000 * 1e6 = 500
      expect(result.tf_rolling_12m).toBe(500);

      // Incidents by severity
      expect(result.open_incidents_by_severity).toHaveLength(1);
      expect(result.open_incidents_by_severity[0].severity).toBe('critical');
      expect(result.open_incidents_by_severity[0].count).toBe(1);

      // Fuel tanks
      expect(result.fuel_tanks).toHaveLength(1);
      expect(result.fuel_tanks[0].tank_id).toBe('tank-1');

      // Stockpiles
      expect(result.stockpiles).toHaveLength(1);
      expect(result.stockpiles[0].balance_kg).toBe(500000n);
      expect(result.stockpiles[0].threshold_status).toBe('ok');

      // Equipment out of service
      expect(result.equipment_out_of_service).toHaveLength(0);

      // cost_per_ton_provisional
      expect(result.cost_per_ton_provisional.amount_minor).toBe(8000n);
      expect(result.cost_per_ton_provisional.currency).toBe('XOF');
      expect(result.cost_per_ton_provisional.label).toBe('cost_per_ton_provisional');
    });

    it('groups open_incidents_by_severity for severities 1-5 (low/medium/high/critical)', async () => {
      // 4 tonnage queries
      mockDs.query
        .mockResolvedValueOnce([{ total: '0' }])
        .mockResolvedValueOnce([{ total: '0' }])
        .mockResolvedValueOnce([{ total: '0' }])
        .mockResolvedValueOnce([{ total: '0' }])
        // yield queries
        .mockResolvedValueOnce([{ avg_yield: 0 }])
        .mockResolvedValueOnce([{ total_t: 0, total_h: 0 }])
        // TF
        .mockResolvedValueOnce([{ incidents: 0, worked_hours: 0 }])
        // incidents by severity — 4 severities
        .mockResolvedValueOnce([
          { severity: 'low', count: 2 },
          { severity: 'medium', count: 3 },
          { severity: 'high', count: 1 },
          { severity: 'critical', count: 1 },
        ])
        .mockResolvedValueOnce([]) // fuel tanks
        .mockResolvedValueOnce([]) // stockpiles
        .mockResolvedValueOnce([]); // equipment

      mockCostPerTon.compute.mockResolvedValueOnce({
        amount_minor: 0n,
        currency: 'XOF',
        label: 'cost_per_ton_provisional',
      });

      const result = await service.computeForSiteDirector(TENANT, SITE, DAY);

      expect(result.open_incidents_by_severity).toHaveLength(4);
      const severities = result.open_incidents_by_severity.map((i) => i.severity);
      expect(severities).toContain('low');
      expect(severities).toContain('medium');
      expect(severities).toContain('high');
      expect(severities).toContain('critical');
    });
  });

  describe('computeForQuarryChief', () => {
    it('returns active drilling plans with progress_pct', async () => {
      // 1) active plans — 100 holes planned, 80 drilled = 80%
      mockDs.query
        .mockResolvedValueOnce([
          { id: 'plan-1', label: 'Plan A', planned: 100, drilled: 80, progress_pct: 80 },
        ])
        // 2) crews
        .mockResolvedValueOnce([{ crews: 5 }])
        // 3) tolerance violations
        .mockResolvedValueOnce([{ violations: 3 }])
        // 4) rotations
        .mockResolvedValueOnce([{ total: 5, in_progress: 2, completed: 3 }])
        // 5) weighing queue
        .mockResolvedValueOnce([{ queue_size: 7 }]);

      const result = await service.computeForQuarryChief(TENANT, SITE, DAY);

      expect(result.active_drilling_plans).toHaveLength(1);
      expect(result.active_drilling_plans[0].progress_pct).toBe(80);
      expect(result.crews_assigned_today).toBe(5);
      expect(result.tolerance_violations_today).toBe(3);
      expect(result.truck_rotations_today.total).toBe(5);
      expect(result.truck_rotations_today.in_progress).toBe(2);
      expect(result.truck_rotations_today.completed).toBe(3);
      expect(result.weighing_queue_size).toBe(7);
    });
  });
});
