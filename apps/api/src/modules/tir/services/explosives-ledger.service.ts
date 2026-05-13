import { createHash, randomUUID } from 'crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { OutboxService } from '../../outbox/outbox.service';
import {
  ExplosivesEvent,
  ExplosivesEventType,
  ExplosivesProductType,
} from '../entities/explosives-event.entity';

/** 32 zero bytes — chain genesis sentinel. */
export const GENESIS_PREV_HASH: Buffer = Buffer.alloc(32, 0);

/**
 * Canonical payload for explosives_event chain-of-hash.
 * Field order is FROZEN per ADR-0012. Do NOT reorder.
 * Must match CANONICAL_PAYLOAD_SQL.explosives_event in event-chain.verifier.ts.
 */
export function buildCanonicalPayload(args: {
  eventType: ExplosivesEventType;
  productType: ExplosivesProductType;
  quantityG: string;
  siteId: string;
  operationalDayId: string;
  sourceReference: Record<string, unknown>;
  occurredAtUtc: Date;
}): Buffer {
  const obj = {
    event_type: args.eventType,
    product_type: args.productType,
    quantity_g: args.quantityG,
    site_id: args.siteId,
    operational_day_id: args.operationalDayId,
    source_reference: args.sourceReference,
    occurred_at_utc: args.occurredAtUtc.toISOString(),
  };
  return Buffer.from(JSON.stringify(obj), 'utf8');
}

export function sha256(prev: Buffer, payload: Buffer): Buffer {
  return createHash('sha256').update(Buffer.concat([prev, payload])).digest();
}

export interface AppendExplosivesEventInput {
  tenantId: string;
  siteId: string;
  operationalDayId: string;
  eventType: ExplosivesEventType;
  productType: ExplosivesProductType;
  /** Signed grams. Positive = IN, negative = OUT. */
  quantityG: bigint;
  unitPriceMinor?: bigint | null;
  currency?: string | null;
  supplier?: string | null;
  docReference?: string | null;
  blastPlanId?: string | null;
  sourceReference?: Record<string, unknown>;
  occurredAtUtc: Date;
  createdBy: string;
  /** Optional caller-supplied id (idempotency). */
  id?: string;
  /** Optional transaction manager (joins caller's tx). */
  manager?: EntityManager;
}

/**
 * ExplosivesLedgerService — TIR-01.
 *
 * Manages the append-only explosives_event ledger with SHA-256 chain-of-hash.
 *
 * CRITICAL pitfalls avoided:
 *   - PDF snapshot is published via OutboxService AFTER the append tx commits
 *     (Pitfall 7 — never inside the append transaction).
 */
@Injectable()
export class ExplosivesLedgerService {
  private readonly logger = new Logger(ExplosivesLedgerService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly outbox: OutboxService,
  ) {}

  async append(input: AppendExplosivesEventInput): Promise<ExplosivesEvent> {
    this.assertInvariants(input);

    const run = async (em: EntityManager): Promise<ExplosivesEvent> => {
      const prev = await this.fetchPrevHash(em, input.tenantId, input.siteId);
      const sourceReference = input.sourceReference ?? {};
      const payload = buildCanonicalPayload({
        eventType: input.eventType,
        productType: input.productType,
        quantityG: input.quantityG.toString(),
        siteId: input.siteId,
        operationalDayId: input.operationalDayId,
        sourceReference,
        occurredAtUtc: input.occurredAtUtc,
      });
      const rowHash = sha256(prev, payload);
      const id = input.id ?? randomUUID();

      const rows = (await em.query(
        `INSERT INTO explosives_event (
           id, occurred_at_utc, tenant_id, site_id, operational_day_id,
           event_type, product_type, quantity_g, unit_price_minor, currency,
           supplier, doc_reference, blast_plan_id, source_reference,
           prev_hash, row_hash, created_by
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6::explosives_event_type, $7::explosives_product_type, $8, $9, $10,
           $11, $12, $13, $14::jsonb,
           $15, $16, $17
         )
         RETURNING id, occurred_at_utc, tenant_id, site_id, operational_day_id,
                   event_type, product_type, quantity_g, unit_price_minor, currency,
                   supplier, doc_reference, blast_plan_id, pdf_sha256,
                   source_reference, prev_hash, row_hash, created_by`,
        [
          id,
          input.occurredAtUtc,
          input.tenantId,
          input.siteId,
          input.operationalDayId,
          input.eventType,
          input.productType,
          input.quantityG.toString(),
          input.unitPriceMinor == null ? null : input.unitPriceMinor.toString(),
          input.currency ?? null,
          input.supplier ?? null,
          input.docReference ?? null,
          input.blastPlanId ?? null,
          JSON.stringify(sourceReference),
          prev,
          rowHash,
          input.createdBy,
        ],
      )) as Array<Record<string, unknown>>;

      const saved = this.mapRow(rows[0]);

      // Publish outbox event for async PDF snapshot — AFTER insert, inside same tx.
      // The outbox row commits atomically with the explosives_event row.
      // The PDF handler runs asynchronously and fills pdf_sha256 via the allowed
      // one-time UPDATE pathway in the trigger.
      await this.outbox.publish({
        manager: em,
        tenantId: input.tenantId,
        aggregateType: 'explosives_event',
        aggregateId: saved.id,
        eventType: 'tir.explosives_event.appended',
        payload: {
          event_id: saved.id,
          site_id: saved.siteId,
          tenant_id: saved.tenantId,
          occurred_at_utc: saved.occurredAtUtc.toISOString(),
        },
      });

      return saved;
    };

    const result = input.manager ? run(input.manager) : this.ds.transaction(run);

    this.logger.log(`[ExplosivesLedger] appended event type=${input.eventType} site=${input.siteId}`);
    return result;
  }

  /** Allows reading the current running balance for a site+day. */
  async getBalance(
    tenantId: string,
    siteId: string,
    operationalDayId: string,
  ): Promise<Record<string, number>> {
    const rows = (await this.ds.query(
      `SELECT product_type, SUM(quantity_g) AS total_g
         FROM explosives_event
        WHERE tenant_id = $1 AND site_id = $2 AND operational_day_id = $3
        GROUP BY product_type`,
      [tenantId, siteId, operationalDayId],
    )) as Array<{ product_type: string; total_g: string }>;

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.product_type] = parseInt(row.total_g, 10);
    }
    return result;
  }

  private async fetchPrevHash(
    em: EntityManager,
    tenantId: string,
    siteId: string,
  ): Promise<Buffer> {
    const rows = (await em.query(
      `SELECT row_hash
         FROM explosives_event
        WHERE tenant_id = $1 AND site_id = $2
        ORDER BY occurred_at_utc DESC, id DESC
        LIMIT 1`,
      [tenantId, siteId],
    )) as Array<{ row_hash: Buffer }>;
    if (rows.length === 0) return GENESIS_PREV_HASH;
    return Buffer.from(rows[0].row_hash);
  }

  private assertInvariants(input: AppendExplosivesEventInput): void {
    if (input.quantityG === 0n) {
      throw new BadRequestException({
        code: 'EXPLOSIVES_QUANTITY_ZERO',
        message: 'quantity_g must be non-zero.',
      });
    }
    const outEvents: ExplosivesEventType[] = ['EXPLOSIVES_OUT_LOAD', 'EXPLOSIVES_RETURN', 'EXPLOSIVES_DESTROY'];
    if (outEvents.includes(input.eventType) && input.quantityG > 0n) {
      throw new BadRequestException({
        code: 'EXPLOSIVES_OUT_MUST_BE_NEGATIVE',
        message: `quantity_g must be negative for ${input.eventType}.`,
      });
    }
    if (input.eventType === 'EXPLOSIVES_IN' && input.quantityG < 0n) {
      throw new BadRequestException({
        code: 'EXPLOSIVES_IN_MUST_BE_POSITIVE',
        message: 'quantity_g must be positive for EXPLOSIVES_IN.',
      });
    }
  }

  private mapRow(r: Record<string, unknown>): ExplosivesEvent {
    return {
      id: r['id'] as string,
      occurredAtUtc: new Date(r['occurred_at_utc'] as string | Date),
      tenantId: r['tenant_id'] as string,
      siteId: r['site_id'] as string,
      operationalDayId: r['operational_day_id'] as string,
      eventType: r['event_type'] as ExplosivesEventType,
      productType: r['product_type'] as ExplosivesProductType,
      quantityG: String(r['quantity_g']),
      unitPriceMinor: r['unit_price_minor'] == null ? null : String(r['unit_price_minor']),
      currency: (r['currency'] as string | null) ?? null,
      supplier: (r['supplier'] as string | null) ?? null,
      docReference: (r['doc_reference'] as string | null) ?? null,
      blastPlanId: (r['blast_plan_id'] as string | null) ?? null,
      pdfSha256: (r['pdf_sha256'] as string | null) ?? null,
      sourceReference: (r['source_reference'] as Record<string, unknown> | null) ?? {},
      prevHash: Buffer.from(r['prev_hash'] as Buffer),
      rowHash: Buffer.from(r['row_hash'] as Buffer),
      createdBy: r['created_by'] as string,
    };
  }
}
