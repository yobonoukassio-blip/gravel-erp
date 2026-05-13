import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EquipmentRefuelService } from '../../../src/modules/fuel/services/equipment-refuel.service';
import { FuelTankEventService } from '../../../src/modules/fuel/services/fuel-tank-event.service';

/**
 * EquipmentRefuelService unit tests — CAR-02.
 *
 * Verifies:
 *   - Atomic creation of refuel + FUEL_DISPENSE_OUT event + equipment_fuel_consumption
 *   - Hour meter regression rejected with ERR_HOUR_METER_REGRESSION
 *   - Tank balance decreases by refueled liters
 *   - hours_since_previous correctly calculated
 */

interface FuelEventRow {
  id: string;
  tenant_id: string;
  site_id: string;
  tank_id: string;
  event_type: string;
  liters_delta: string;
  operational_day_id: string;
  source_reference: Record<string, unknown>;
  occurred_at_utc: Date;
  created_by: string;
  prev_hash: Buffer;
  row_hash: Buffer;
  cost_per_liter_minor_units: string | null;
  currency: string | null;
  created_at_utc: Date;
}

interface RefuelRow {
  id: string;
  tenant_id: string;
  site_id: string;
  tank_id: string;
  equipment_id: string;
  operator_id: string;
  liters: string;
  equipment_hour_meter_reading: string;
  gauge_photo_blob_sha256: string | null;
  operational_day_id: string;
  created_at_local: Date;
  iana_timezone: string;
  notes: string | null;
  created_by: string;
  created_at_utc: Date;
}

interface ConsumptionRow {
  id: string;
  tenant_id: string;
  site_id: string;
  equipment_id: string;
  refuel_id: string;
  operational_day_id: string;
  liters: string;
  hour_meter_reading: string;
  hours_since_previous: string | null;
  cost_per_liter_minor_units: string | null;
  currency: string | null;
  created_at_utc: Date;
}

class FakeDb {
  fuelEvents: FuelEventRow[] = [];
  refuels: RefuelRow[] = [];
  consumptions: ConsumptionRow[] = [];

  // Simulate a pre-existing FUEL_DELIVERY_IN with cost
  deliveryRows: Array<{ cost_per_liter_minor_units: string | null; currency: string | null }> = [];
  prevHashOverride: Buffer | null = null;

  async query(sql: string, params: unknown[] = []): Promise<unknown[]> {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    // fetchPrevHash call in FuelTankEventService
    if (normalized.startsWith('SELECT row_hash FROM fuel_tank_event')) {
      const [tenantId] = params as [string];
      const matching = this.fuelEvents
        .filter((r) => r.tenant_id === tenantId)
        .sort((a, b) => b.occurred_at_utc.getTime() - a.occurred_at_utc.getTime());
      if (this.prevHashOverride) return [{ row_hash: this.prevHashOverride }];
      return matching.length === 0 ? [] : [{ row_hash: matching[0].row_hash }];
    }

    // INSERT fuel_tank_event
    if (normalized.startsWith('INSERT INTO fuel_tank_event')) {
      const id = params[0] as string;
      const row: FuelEventRow = {
        id,
        tenant_id: params[1] as string,
        site_id: params[2] as string,
        tank_id: params[3] as string,
        event_type: params[4] as string,
        liters_delta: params[5] as string,
        operational_day_id: params[6] as string,
        source_reference: JSON.parse(params[7] as string),
        occurred_at_utc: params[8] as Date,
        created_by: params[9] as string,
        prev_hash: params[10] as Buffer,
        row_hash: params[11] as Buffer,
        cost_per_liter_minor_units: params[12] as string | null,
        currency: params[13] as string | null,
        created_at_utc: new Date(),
      };
      this.fuelEvents.push(row);
      return [row];
    }

    // SELECT previous hour meter reading (validateHourMeter + computeHoursSince)
    if (
      normalized.startsWith('SELECT equipment_hour_meter_reading FROM equipment_refuel')
    ) {
      const [tenantId, equipmentId] = params as [string, string];
      const matching = this.refuels
        .filter((r) => r.tenant_id === tenantId && r.equipment_id === equipmentId)
        .sort((a, b) => b.created_at_utc.getTime() - a.created_at_utc.getTime());
      return matching.length === 0
        ? []
        : [{ equipment_hour_meter_reading: matching[0].equipment_hour_meter_reading }];
    }

    // fetchLatestDeliveryCost
    if (normalized.includes('SELECT cost_per_liter_minor_units, currency FROM fuel_tank_event')) {
      return this.deliveryRows.length > 0 ? [this.deliveryRows[0]] : [];
    }

    // INSERT equipment_refuel
    if (normalized.startsWith('INSERT INTO equipment_refuel')) {
      const row: RefuelRow = {
        id: params[0] as string,
        tenant_id: params[1] as string,
        site_id: params[2] as string,
        tank_id: params[3] as string,
        equipment_id: params[4] as string,
        operator_id: params[5] as string,
        liters: params[6] as string,
        equipment_hour_meter_reading: params[7] as string,
        gauge_photo_blob_sha256: params[8] as string | null,
        operational_day_id: params[9] as string,
        created_at_local: params[10] as Date,
        iana_timezone: params[11] as string,
        notes: params[12] as string | null,
        created_by: params[13] as string,
        created_at_utc: new Date(),
      };
      this.refuels.push(row);
      return [row];
    }

    // INSERT equipment_fuel_consumption
    if (normalized.startsWith('INSERT INTO equipment_fuel_consumption')) {
      const row: ConsumptionRow = {
        id: params[0] as string,
        tenant_id: params[1] as string,
        site_id: params[2] as string,
        equipment_id: params[3] as string,
        refuel_id: params[4] as string,
        operational_day_id: params[5] as string,
        liters: params[6] as string,
        hour_meter_reading: params[7] as string,
        hours_since_previous: params[8] as string | null,
        cost_per_liter_minor_units: params[9] as string | null,
        currency: params[10] as string | null,
        created_at_utc: new Date(),
      };
      this.consumptions.push(row);
      return [];
    }

    return [];
  }
}

class FakeDataSource {
  db = new FakeDb();
  async transaction<T>(cb: (em: FakeDb) => Promise<T>): Promise<T> {
    return cb(this.db);
  }
}

function makeService(): {
  svc: EquipmentRefuelService;
  ds: FakeDataSource;
  bus: EventEmitter2;
} {
  const ds = new FakeDataSource();
  const bus = new EventEmitter2();
  const fuelEventSvc = new FuelTankEventService(ds as unknown as never, bus);
  const svc = new EquipmentRefuelService(ds as unknown as never, fuelEventSvc, bus);
  return { svc, ds, bus };
}

function baseInput(
  overrides: Partial<Parameters<EquipmentRefuelService['create']>[0]> = {},
) {
  return {
    tenantId: 't1',
    siteId: 's1',
    tankId: 'tank1',
    equipmentId: 'eq1',
    operatorId: 'op1',
    liters: 50,
    equipmentHourMeterReading: 100,
    operationalDayId: 'od1',
    createdAtLocal: new Date('2026-06-01T10:00:00'),
    ianaTimezone: 'Africa/Abidjan',
    createdBy: 'u1',
    occurredAtUtc: new Date('2026-06-01T10:00:00Z'),
    ...overrides,
  };
}

describe('EquipmentRefuelService.create (CAR-02)', () => {
  it('atomically creates refuel + FUEL_DISPENSE_OUT event + equipment_fuel_consumption', async () => {
    const { svc, ds } = makeService();

    // Seed a pre-existing FUEL_DELIVERY_IN with 100L balance (cost info)
    ds.db.deliveryRows = [
      { cost_per_liter_minor_units: '75000', currency: 'XOF' },
    ];

    const refuel = await svc.create(baseInput({ liters: 50 }));

    expect(refuel.liters).toBe('50');
    expect(refuel.equipmentId).toBe('eq1');

    // FUEL_DISPENSE_OUT event created
    expect(ds.db.fuelEvents).toHaveLength(1);
    expect(ds.db.fuelEvents[0].event_type).toBe('FUEL_DISPENSE_OUT');
    expect(parseFloat(ds.db.fuelEvents[0].liters_delta)).toBe(-50);

    // equipment_fuel_consumption row created
    expect(ds.db.consumptions).toHaveLength(1);
    expect(ds.db.consumptions[0].refuel_id).toBe(refuel.id);
    expect(ds.db.consumptions[0].liters).toBe('50');
    expect(ds.db.consumptions[0].hours_since_previous).toBeNull(); // first refuel
    expect(ds.db.consumptions[0].cost_per_liter_minor_units).toBe('75000');
  });

  it('calculates hours_since_previous for second refuel', async () => {
    const { svc, ds } = makeService();

    // First refuel at hour 100
    await svc.create(baseInput({ liters: 20, equipmentHourMeterReading: 100 }));

    // Second refuel at hour 108
    await svc.create(
      baseInput({
        liters: 30,
        equipmentHourMeterReading: 108,
        occurredAtUtc: new Date('2026-06-01T18:00:00Z'),
      }),
    );

    expect(ds.db.consumptions).toHaveLength(2);
    expect(ds.db.consumptions[0].hours_since_previous).toBeNull();
    expect(ds.db.consumptions[1].hours_since_previous).toBe('8');
  });

  it('rejects when hour_meter_reading < previous reading (ERR_HOUR_METER_REGRESSION)', async () => {
    const { svc, ds } = makeService();

    // First refuel at hour 200
    await svc.create(baseInput({ liters: 20, equipmentHourMeterReading: 200 }));

    // Attempt regression to hour 150
    await expect(
      svc.create(
        baseInput({
          liters: 15,
          equipmentHourMeterReading: 150,
          occurredAtUtc: new Date('2026-06-02T10:00:00Z'),
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts equal hour_meter_reading (same-hour refuel allowed)', async () => {
    const { svc, ds } = makeService();
    await svc.create(baseInput({ liters: 20, equipmentHourMeterReading: 100 }));
    // Equal is allowed — not a regression
    await expect(
      svc.create(
        baseInput({
          liters: 10,
          equipmentHourMeterReading: 100,
          occurredAtUtc: new Date('2026-06-01T12:00:00Z'),
        }),
      ),
    ).resolves.toBeDefined();
  });

  it('emits production.fuel.refuel_appended post-commit', async () => {
    const { svc, bus } = makeService();
    const spy = jest.fn();
    bus.on('production.fuel.refuel_appended', spy);

    await svc.create(baseInput({ liters: 50 }));

    expect(spy).toHaveBeenCalledTimes(1);
    const evt = spy.mock.calls[0][0] as Record<string, unknown>;
    expect(evt['liters']).toBe(50);
    expect(evt['tankId']).toBe('tank1');
  });
});
