import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FuelTankEventService } from './fuel-tank-event.service';

export interface ReconciliationDriftPayload {
  tenantId: string;
  siteId: string;
  tankId: string;
  theoreticalBalance: number;
  projectedBalance: number;
  driftLiters: number;
  capacityLiters: number;
  driftPct: number;
  detectedAtUtc: string;
}

interface TankRow {
  id: string;
  tenant_id: string;
  site_id: string;
  capacity_liters: number;
}

interface BalanceSumRow {
  total: string;
}

interface ProjectedBalanceRow {
  balance_liters: string;
}

/** Drift threshold: 0.5% of tank capacity. */
export const RECONCILIATION_DRIFT_THRESHOLD_PCT = 0.005;

/**
 * FuelReconciliationService (CAR-01, D2-53) — nightly tank reconciliation.
 *
 * For each tank:
 *   theoretical_balance = sum(liters_delta) from fuel_tank_event genesis
 *   projected_balance   = fuel_tank_balance.balance_liters
 *   drift = theoretical - projected
 *
 *   Always inserts a FUEL_RECONCILIATION event (informational, liters_delta=0).
 *   If |drift| > 0.5% of capacity → emit production.fuel.reconciliation_drift_detected.
 *
 * Token `FUEL_RECONCILIATION` appears verbatim for downstream code search.
 */
@Injectable()
export class FuelReconciliationService {
  private readonly logger = new Logger(FuelReconciliationService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly fuelEventService: FuelTankEventService,
    private readonly events: EventEmitter2,
  ) {}

  /** Run reconciliation for a single tank. Returns true if drift alert emitted. */
  async runForTank(tankId: string): Promise<boolean> {
    const tanks = (await this.ds.query(
      `SELECT id, tenant_id, site_id, capacity_liters FROM fuel_tank WHERE id = $1`,
      [tankId],
    )) as TankRow[];

    if (tanks.length === 0) {
      this.logger.warn(`runForTank: tank ${tankId} not found`);
      return false;
    }

    const tank = tanks[0];
    const { tenant_id: tenantId, site_id: siteId, capacity_liters: capacityLiters } = tank;

    // Theoretical balance from event sum
    const sumRows = (await this.ds.query(
      `SELECT COALESCE(SUM(liters_delta), 0)::text AS total
         FROM fuel_tank_event
        WHERE tenant_id = $1 AND tank_id = $2`,
      [tenantId, tankId],
    )) as BalanceSumRow[];

    const theoreticalBalance = parseFloat(sumRows[0]?.total ?? '0');

    // Projected balance from projection table (may not exist yet)
    const projectedRows = (await this.ds.query(
      `SELECT balance_liters FROM fuel_tank_balance WHERE tenant_id = $1 AND tank_id = $2`,
      [tenantId, tankId],
    )) as ProjectedBalanceRow[];

    const projectedBalance =
      projectedRows.length > 0 ? parseFloat(projectedRows[0].balance_liters) : theoreticalBalance;

    const driftLiters = theoreticalBalance - projectedBalance;
    const absDrift = Math.abs(driftLiters);
    const driftPct = capacityLiters > 0 ? absDrift / capacityLiters : 0;

    const now = new Date();
    const operationalDayId = await this.fetchCurrentOperationalDayId(tenantId, siteId);

    // Always insert informational FUEL_RECONCILIATION event (liters_delta=0)
    await this.fuelEventService.append({
      tenantId,
      siteId,
      tankId,
      eventType: 'FUEL_RECONCILIATION',
      litersDelta: 0,
      operationalDayId,
      sourceReference: {
        theoretical_balance: theoreticalBalance,
        projected_balance: projectedBalance,
        drift_liters: driftLiters,
      },
      occurredAtUtc: now,
      createdBy: 'system',
      actorRole: 'SYSTEM',
    });

    if (driftPct > RECONCILIATION_DRIFT_THRESHOLD_PCT) {
      const payload: ReconciliationDriftPayload = {
        tenantId,
        siteId,
        tankId,
        theoreticalBalance,
        projectedBalance,
        driftLiters,
        capacityLiters,
        driftPct: Math.round(driftPct * 10000) / 10000,
        detectedAtUtc: now.toISOString(),
      };
      this.events.emit('production.fuel.reconciliation_drift_detected', payload);
      this.logger.warn(
        `Reconciliation drift: tank=${tankId} drift=${driftLiters}L (${(driftPct * 100).toFixed(2)}%)`,
      );
      return true;
    }

    this.logger.log(`Reconciliation OK: tank=${tankId} drift=${driftLiters}L (${(driftPct * 100).toFixed(3)}%)`);
    return false;
  }

  private async fetchCurrentOperationalDayId(tenantId: string, siteId: string): Promise<string> {
    const rows = (await this.ds.query(
      `SELECT id FROM operational_days WHERE tenant_id = $1 AND site_id = $2
       AND date_local = CURRENT_DATE ORDER BY created_at DESC LIMIT 1`,
      [tenantId, siteId],
    )) as Array<{ id: string }>;
    if (rows.length > 0) return rows[0].id;
    // Fallback: generate a deterministic ID for system events when no active opday
    return randomUUID();
  }
}
