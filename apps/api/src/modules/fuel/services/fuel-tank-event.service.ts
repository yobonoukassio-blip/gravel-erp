import { createHash, randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import {
  FuelTankEvent,
  FuelTankEventType,
} from '../entities/fuel-tank-event.entity';

export interface AppendFuelTankEventInput {
  tenantId: string;
  siteId: string;
  tankId: string;
  eventType: FuelTankEventType;
  /** Signed numeric in litres. DELIVERY_IN > 0, DISPENSE_OUT < 0. */
  litersDelta: number;
  operationalDayId: string;
  sourceReference?: Record<string, unknown>;
  occurredAtUtc: Date;
  createdBy: string;
  /** Caller role. FUEL_ADJUSTMENT requires 'SITE_MANAGER'. */
  actorRole: string;
  costPerLiterMinorUnits?: bigint | null;
  currency?: string | null;
  /** Optional caller-supplied id (used by idempotency / outbox replays). */
  id?: string;
  /** Optional transaction manager (joins caller's tx). */
  manager?: EntityManager;
}

/** 32 zero bytes — chain genesis sentinel. */
export const GENESIS_PREV_HASH: Buffer = Buffer.alloc(32, 0);

/**
 * Canonical payload bytes — MUST match `CANONICAL_PAYLOAD_SQL.fuel_tank_event`
 * in `event-chain.verifier.ts`. The verifier rebuilds these bytes server-side
 * via Postgres jsonb_build_object → text → UTF8 bytes; we mirror that exactly
 * so `sha256(prev || canonical)` is stable across writer and verifier.
 */
export function buildFuelCanonicalPayload(args: {
  eventType: FuelTankEventType;
  tankId: string;
  litersDelta: number;
  operationalDayId: string;
  sourceReference: Record<string, unknown>;
  occurredAtUtc: Date;
  costPerLiterMinorUnits: bigint | null | undefined;
  currency: string | null | undefined;
}): Buffer {
  const obj = {
    event_type: args.eventType,
    tank_id: args.tankId,
    liters_delta: args.litersDelta.toString(),
    operational_day_id: args.operationalDayId,
    source_reference: args.sourceReference,
    occurred_at_utc: args.occurredAtUtc.toISOString(),
    cost_per_liter_minor_units:
      args.costPerLiterMinorUnits == null ? null : args.costPerLiterMinorUnits.toString(),
    currency: args.currency ?? null,
  };
  return Buffer.from(JSON.stringify(obj), 'utf8');
}

export function sha256Fuel(prev: Buffer, payload: Buffer): Buffer {
  return createHash('sha256').update(Buffer.concat([prev, payload])).digest();
}

@Injectable()
export class FuelTankEventService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly events: EventEmitter2,
  ) {}

  async append(input: AppendFuelTankEventInput): Promise<FuelTankEvent> {
    this.assertAuthorization(input);
    this.assertInvariants(input);

    const run = async (em: EntityManager): Promise<FuelTankEvent> => {
      // Compute chain.
      const prev = await this.fetchPrevHash(em, input.tenantId);
      const sourceReference = input.sourceReference ?? {};
      const payload = buildFuelCanonicalPayload({
        eventType: input.eventType,
        tankId: input.tankId,
        litersDelta: input.litersDelta,
        operationalDayId: input.operationalDayId,
        sourceReference,
        occurredAtUtc: input.occurredAtUtc,
        costPerLiterMinorUnits: input.costPerLiterMinorUnits,
        currency: input.currency,
      });
      const rowHash = sha256Fuel(prev, payload);

      const id = input.id ?? randomUUID();
      const rows = (await em.query(
        `INSERT INTO fuel_tank_event (
           id, tenant_id, site_id, tank_id, event_type, liters_delta,
           operational_day_id, source_reference,
           occurred_at_utc, created_by, prev_hash, row_hash,
           cost_per_liter_minor_units, currency
         ) VALUES (
           $1, $2, $3, $4, $5::fuel_tank_event_type, $6,
           $7, $8::jsonb,
           $9, $10, $11, $12,
           $13, $14
         )
         RETURNING id, occurred_at_utc, tenant_id, site_id, tank_id, event_type,
                   liters_delta, operational_day_id, source_reference,
                   created_by, prev_hash, row_hash,
                   cost_per_liter_minor_units, currency, created_at_utc`,
        [
          id,
          input.tenantId,
          input.siteId,
          input.tankId,
          input.eventType,
          input.litersDelta.toString(),
          input.operationalDayId,
          JSON.stringify(sourceReference),
          input.occurredAtUtc,
          input.createdBy,
          prev,
          rowHash,
          input.costPerLiterMinorUnits == null ? null : input.costPerLiterMinorUnits.toString(),
          input.currency ?? null,
        ],
      )) as Array<Record<string, unknown>>;

      const saved = this.mapRow(rows[0]);

      this.events.emit('production.fuel.event_appended', {
        tenantId: saved.tenantId,
        siteId: saved.siteId,
        tankId: saved.tankId,
        eventType: saved.eventType,
        litersDelta: parseFloat(saved.litersDelta),
        eventId: saved.id,
        occurredAtUtc: saved.occurredAtUtc,
      });

      return saved;
    };

    if (input.manager) return run(input.manager);
    return this.ds.transaction(run);
  }

  async fetchPrevHash(em: EntityManager, tenantId: string): Promise<Buffer> {
    const rows = (await em.query(
      `SELECT row_hash
         FROM fuel_tank_event
        WHERE tenant_id = $1
        ORDER BY occurred_at_utc DESC, id DESC
        LIMIT 1`,
      [tenantId],
    )) as Array<{ row_hash: Buffer }>;
    if (rows.length === 0) return GENESIS_PREV_HASH;
    return Buffer.from(rows[0].row_hash);
  }

  private assertAuthorization(input: AppendFuelTankEventInput): void {
    if (input.eventType === 'FUEL_ADJUSTMENT' && input.actorRole !== 'SITE_MANAGER') {
      throw new ForbiddenException({
        code: 'FUEL_ADJUSTMENT_ROLE_REQUIRED',
        message: 'FUEL_ADJUSTMENT requires SITE_MANAGER role (D2-50).',
      });
    }
  }

  private assertInvariants(input: AppendFuelTankEventInput): void {
    if (input.eventType === 'FUEL_ADJUSTMENT') {
      const ref = input.sourceReference ?? {};
      if (
        typeof ref['gauge_photo_sha256'] !== 'string' ||
        (ref['gauge_photo_sha256'] as string).length === 0
      ) {
        throw new BadRequestException({
          code: 'ADJUSTMENT_PHOTO_REQUIRED',
          message: 'FUEL_ADJUSTMENT requires source_reference.gauge_photo_sha256.',
        });
      }
      if (typeof ref['reason'] !== 'string' || (ref['reason'] as string).trim().length === 0) {
        throw new BadRequestException({
          code: 'ADJUSTMENT_REASON_REQUIRED',
          message: 'FUEL_ADJUSTMENT requires source_reference.reason.',
        });
      }
    }
  }

  mapRow(r: Record<string, unknown>): FuelTankEvent {
    return {
      id: r['id'] as string,
      occurredAtUtc: new Date(r['occurred_at_utc'] as string | Date),
      tenantId: r['tenant_id'] as string,
      siteId: r['site_id'] as string,
      tankId: r['tank_id'] as string,
      eventType: r['event_type'] as FuelTankEventType,
      litersDelta: String(r['liters_delta']),
      operationalDayId: r['operational_day_id'] as string,
      sourceReference: (r['source_reference'] as Record<string, unknown> | null) ?? {},
      createdBy: r['created_by'] as string,
      prevHash: Buffer.from(r['prev_hash'] as Buffer),
      rowHash: Buffer.from(r['row_hash'] as Buffer),
      costPerLiterMinorUnits:
        r['cost_per_liter_minor_units'] == null ? null : String(r['cost_per_liter_minor_units']),
      currency: (r['currency'] as string | null) ?? null,
      createdAtUtc: new Date(r['created_at_utc'] as string | Date),
    };
  }
}
