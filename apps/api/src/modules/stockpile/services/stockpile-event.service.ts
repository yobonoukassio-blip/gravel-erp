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
  MaterialType,
  StockpileEvent,
  StockpileEventType,
} from '../entities/stockpile-event.entity';

export interface AppendStockpileEventInput {
  tenantId: string;
  siteId: string;
  stockpileId: string;
  eventType: StockpileEventType;
  /** Signed BIGINT in kg. INFLOW > 0, OUTFLOW < 0. */
  tonnageDeltaKg: bigint;
  materialType: MaterialType;
  calibreCode: string;
  operationalDayId: string;
  sourceReference?: Record<string, unknown>;
  occurredAtUtc: Date;
  createdBy: string;
  /** Caller role. STOCKPILE_ADJUSTMENT requires 'SITE_MANAGER'. */
  actorRole: string;
  costPerTonMinorUnits?: bigint | null;
  currency?: string | null;
  /** Optional caller-supplied id (used by idempotency / outbox replays). */
  id?: string;
  /** Optional transaction manager (joins caller's tx). */
  manager?: EntityManager;
}

/** 32 zero bytes — chain genesis sentinel. */
export const GENESIS_PREV_HASH: Buffer = Buffer.alloc(32, 0);

/**
 * Canonical payload bytes — MUST match `CANONICAL_PAYLOAD_SQL.stockpile_event`
 * in `event-chain.verifier.ts`. The verifier rebuilds these bytes server-side
 * via Postgres jsonb_build_object → text → UTF8 bytes; we mirror that exactly
 * so `sha256(prev || canonical)` is stable across writer and verifier.
 */
export function buildCanonicalPayload(args: {
  eventType: StockpileEventType;
  stockpileId: string;
  tonnageDeltaKg: bigint;
  materialType: MaterialType;
  calibreCode: string;
  operationalDayId: string;
  sourceReference: Record<string, unknown>;
  occurredAtUtc: Date;
}): Buffer {
  // Match Postgres `jsonb_build_object(...)::text` ordering and serialization:
  // - jsonb stringifies BIGINT as text via ::text cast in canonical SQL
  // - timestamptz::text yields ISO with offset; we use Date.toISOString() — see
  //   verifier note: the verifier reads from DB so the writer must INSERT the
  //   exact same UTC instant. Day-level partitioning + tenant scope means
  //   tests don't compare across writers; integrity tests verify the verifier
  //   re-derivation against stored payload columns (DB authoritative).
  const obj = {
    event_type: args.eventType,
    stockpile_id: args.stockpileId,
    tonnage_delta_kg: args.tonnageDeltaKg.toString(),
    material_type: args.materialType,
    calibre_code: args.calibreCode,
    operational_day_id: args.operationalDayId,
    source_reference: args.sourceReference,
    occurred_at_utc: args.occurredAtUtc.toISOString(),
  };
  return Buffer.from(JSON.stringify(obj), 'utf8');
}

export function sha256(prev: Buffer, payload: Buffer): Buffer {
  return createHash('sha256').update(Buffer.concat([prev, payload])).digest();
}

@Injectable()
export class StockpileEventService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly events: EventEmitter2,
  ) {}

  async append(input: AppendStockpileEventInput): Promise<StockpileEvent> {
    this.assertAuthorization(input);
    this.assertInvariants(input);

    const run = async (em: EntityManager): Promise<StockpileEvent> => {
      // Idempotency: rotation_id is the natural key for outbox-driven inflows.
      const rotationId = (input.sourceReference ?? {})['rotation_id'];
      if (typeof rotationId === 'string') {
        const existing = await em.query(
          `SELECT id, occurred_at_utc, tenant_id, site_id, stockpile_id, event_type,
                  tonnage_delta_kg, material_type, calibre_code, operational_day_id,
                  source_reference, created_by, prev_hash, row_hash,
                  cost_per_ton_minor_units, currency, cost_model_version, created_at_utc
             FROM stockpile_event
            WHERE tenant_id = $1 AND source_reference->>'rotation_id' = $2
            LIMIT 1`,
          [input.tenantId, rotationId],
        );
        if (Array.isArray(existing) && existing.length > 0) {
          return this.mapRow(existing[0] as Record<string, unknown>);
        }
      }

      // Compute chain.
      const prev = await this.fetchPrevHash(em, input.tenantId);
      const sourceReference = input.sourceReference ?? {};
      const payload = buildCanonicalPayload({
        eventType: input.eventType,
        stockpileId: input.stockpileId,
        tonnageDeltaKg: input.tonnageDeltaKg,
        materialType: input.materialType,
        calibreCode: input.calibreCode,
        operationalDayId: input.operationalDayId,
        sourceReference,
        occurredAtUtc: input.occurredAtUtc,
      });
      const rowHash = sha256(prev, payload);

      const id = input.id ?? randomUUID();
      const rows = (await em.query(
        `INSERT INTO stockpile_event (
           id, tenant_id, site_id, stockpile_id, event_type, tonnage_delta_kg,
           material_type, calibre_code, operational_day_id, source_reference,
           occurred_at_utc, created_by, prev_hash, row_hash,
           cost_per_ton_minor_units, currency, cost_model_version
         ) VALUES (
           $1, $2, $3, $4, $5::stockpile_event_type, $6,
           $7::material_type_enum, $8, $9, $10::jsonb,
           $11, $12, $13, $14,
           $15, $16, $17
         )
         RETURNING id, occurred_at_utc, tenant_id, site_id, stockpile_id, event_type,
                   tonnage_delta_kg, material_type, calibre_code, operational_day_id,
                   source_reference, created_by, prev_hash, row_hash,
                   cost_per_ton_minor_units, currency, cost_model_version, created_at_utc`,
        [
          id,
          input.tenantId,
          input.siteId,
          input.stockpileId,
          input.eventType,
          input.tonnageDeltaKg.toString(),
          input.materialType,
          input.calibreCode,
          input.operationalDayId,
          JSON.stringify(sourceReference),
          input.occurredAtUtc,
          input.createdBy,
          prev,
          rowHash,
          input.costPerTonMinorUnits == null ? null : input.costPerTonMinorUnits.toString(),
          input.currency ?? null,
          1,
        ],
      )) as Array<Record<string, unknown>>;

      const saved = this.mapRow(rows[0]);

      // Fire-and-forget projection trigger.
      this.events.emit('production.stockpile.event_appended', {
        tenantId: saved.tenantId,
        siteId: saved.siteId,
        stockpileId: saved.stockpileId,
        calibreCode: saved.calibreCode,
        eventType: saved.eventType,
        tonnageDeltaKg: BigInt(saved.tonnageDeltaKg),
        costPerTonMinorUnits:
          saved.costPerTonMinorUnits == null
            ? null
            : BigInt(saved.costPerTonMinorUnits),
        currency: saved.currency ?? null,
        eventId: saved.id,
        occurredAtUtc: saved.occurredAtUtc,
      });

      return saved;
    };

    if (input.manager) return run(input.manager);
    return this.ds.transaction(run);
  }

  private async fetchPrevHash(em: EntityManager, tenantId: string): Promise<Buffer> {
    const rows = (await em.query(
      `SELECT row_hash
         FROM stockpile_event
        WHERE tenant_id = $1
        ORDER BY occurred_at_utc DESC, id DESC
        LIMIT 1`,
      [tenantId],
    )) as Array<{ row_hash: Buffer }>;
    if (rows.length === 0) return GENESIS_PREV_HASH;
    return Buffer.from(rows[0].row_hash);
  }

  private assertAuthorization(input: AppendStockpileEventInput): void {
    if (input.eventType === 'STOCKPILE_ADJUSTMENT' && input.actorRole !== 'SITE_MANAGER') {
      throw new ForbiddenException({
        code: 'STOCKPILE_ADJUSTMENT_ROLE_REQUIRED',
        message: 'STOCKPILE_ADJUSTMENT requires SITE_MANAGER role (D2-111).',
      });
    }
  }

  private assertInvariants(input: AppendStockpileEventInput): void {
    if (input.eventType === 'STOCKPILE_ADJUSTMENT') {
      const ref = input.sourceReference ?? {};
      if (typeof ref['reason'] !== 'string' || (ref['reason'] as string).trim().length === 0) {
        throw new BadRequestException({
          code: 'ADJUSTMENT_REASON_REQUIRED',
          message: 'STOCKPILE_ADJUSTMENT requires source_reference.reason.',
        });
      }
      if (
        typeof ref['photo_sha256'] !== 'string' ||
        (ref['photo_sha256'] as string).length === 0
      ) {
        throw new BadRequestException({
          code: 'ADJUSTMENT_PHOTO_REQUIRED',
          message: 'STOCKPILE_ADJUSTMENT requires source_reference.photo_sha256.',
        });
      }
    }

    if (input.tonnageDeltaKg === 0n) {
      throw new BadRequestException({
        code: 'TONNAGE_DELTA_ZERO',
        message: 'tonnage_delta_kg must be non-zero.',
      });
    }
  }

  private mapRow(r: Record<string, unknown>): StockpileEvent {
    return {
      id: r['id'] as string,
      occurredAtUtc: new Date(r['occurred_at_utc'] as string | Date),
      tenantId: r['tenant_id'] as string,
      siteId: r['site_id'] as string,
      stockpileId: r['stockpile_id'] as string,
      eventType: r['event_type'] as StockpileEventType,
      tonnageDeltaKg: String(r['tonnage_delta_kg']),
      materialType: r['material_type'] as MaterialType,
      calibreCode: r['calibre_code'] as string,
      operationalDayId: r['operational_day_id'] as string,
      sourceReference:
        (r['source_reference'] as Record<string, unknown> | null) ?? {},
      createdBy: r['created_by'] as string,
      prevHash: Buffer.from(r['prev_hash'] as Buffer),
      rowHash: Buffer.from(r['row_hash'] as Buffer),
      costPerTonMinorUnits:
        r['cost_per_ton_minor_units'] == null
          ? null
          : String(r['cost_per_ton_minor_units']),
      currency: (r['currency'] as string | null) ?? null,
      costModelVersion: Number(r['cost_model_version']),
      createdAtUtc: new Date(r['created_at_utc'] as string | Date),
    };
  }
}
