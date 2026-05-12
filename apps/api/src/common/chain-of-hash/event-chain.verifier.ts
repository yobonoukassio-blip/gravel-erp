import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';

/**
 * Generic event-chain verifier (Phase 2).
 *
 * Verifies the chain-of-hash on append-only event tables that all carry the
 * common shape:
 *   { id uuid, tenant_id uuid, prev_hash bytea, row_hash bytea,
 *     occurred_at_utc timestamptz, canonical_payload bytea | jsonb }
 *
 * Phase 2 callers: `stockpile_event`, `fuel_tank_event`, `hse_incident`
 * (per D2-40, D2-50, D2-60). Phase 1 audit_log uses the older
 * `AuditChainVerifier` keyed by (tenant_id, table_name) — kept as-is.
 *
 * Algorithm (matches ADR-0004 generalized):
 *   genesis prev_hash = 32 zero bytes (Buffer.alloc(32, 0))
 *   row_hash[n] = sha256(prev_hash[n] || canonical_payload[n])
 *   prev_hash[n] === row_hash[n-1] for n > 0
 *
 * The verifier is read-only and tenant-scoped: pass the tenantId from the
 * authenticated request (CLS) — RLS would also enforce it, but the verifier
 * executes directly via `ds.query` so we filter explicitly.
 */
export type ChainTableName = 'stockpile_event' | 'fuel_tank_event' | 'hse_incident';

export interface ChainBrokenAt {
  id: string;
  expected_hex: string;
  found_hex: string;
  reason:
    | 'prev_hash_mismatch'
    | 'row_hash_mismatch'
    | 'genesis_non_zero_prev_hash'
    | 'phantom_event_inserted';
}

export interface ChainVerifyResult {
  valid: boolean;
  eventsChecked: number;
  brokenAt?: ChainBrokenAt;
}

export interface VerifyChainOptions {
  /** Restrict verification to events at or after this instant. */
  since?: Date;
}

/** 32 zero bytes — genesis sentinel. */
export const GENESIS_PREV_HASH: Buffer = Buffer.alloc(32, 0);

/**
 * Pure helper. Exposed for unit tests that seed fixtures.
 *
 * The verifier expects callers to have stored `canonical_payload` as the
 * exact byte sequence over which `sha256(prev_hash || canonical_payload)`
 * was computed at insert time. For tables where the canonical payload is
 * not persisted as a single column, the verifier rebuilds it via the table
 * map below (see `CANONICAL_PAYLOAD_SQL`).
 */
export function computeRowHash(prevHash: Buffer, canonicalPayload: Buffer): Buffer {
  return createHash('sha256').update(Buffer.concat([prevHash, canonicalPayload])).digest();
}

/**
 * Per-table SQL fragment that yields a single bytea `canonical_payload`
 * column from the row's stored fields. Keeping this server-side means the
 * verifier and the insert trigger always agree on the exact byte sequence.
 *
 * Phase 2 callers will materialize these tables in their respective waves
 * (W2 stockpile, W2 fuel, W3 HSE). The verifier supports them today; if a
 * table does not yet exist, `verifyChain` returns `{ valid: true,
 * eventsChecked: 0 }` (caller can treat as "no events to verify yet").
 */
const CANONICAL_PAYLOAD_SQL: Readonly<Record<ChainTableName, string>> = Object.freeze({
  stockpile_event: `
    convert_to(
      jsonb_build_object(
        'event_type', event_type,
        'stockpile_id', stockpile_id::text,
        'tonnage_delta_kg', tonnage_delta_kg::text,
        'material_type', material_type,
        'calibre_code', calibre_code,
        'operational_day_id', operational_day_id::text,
        'source_reference', source_reference,
        'occurred_at_utc', occurred_at_utc::text
      )::text,
      'UTF8'
    )
  `,
  fuel_tank_event: `
    convert_to(
      jsonb_build_object(
        'event_type', event_type,
        'tank_id', tank_id::text,
        'liters_delta', liters_delta::text,
        'operational_day_id', operational_day_id::text,
        'source_reference', source_reference,
        'occurred_at_utc', occurred_at_utc::text,
        'cost_per_liter_minor_units', cost_per_liter_minor_units,
        'currency', currency
      )::text,
      'UTF8'
    )
  `,
  hse_incident: `
    convert_to(
      jsonb_build_object(
        'category', category,
        'severity', severity,
        'occurred_at_local', occurred_at_local::text,
        'iana_timezone', iana_timezone,
        'operational_day_id', operational_day_id::text,
        'location_text', location_text,
        'people_impacted', people_impacted,
        'equipment_impacted_ids', equipment_impacted_ids,
        'chronology_md', chronology_md,
        'content_addressed_attachments', content_addressed_attachments
      )::text,
      'UTF8'
    )
  `,
});

interface ChainRow {
  id: string;
  prev_hash: Buffer;
  row_hash: Buffer;
  canonical_payload: Buffer;
}

@Injectable()
export class EventChainVerifier {
  constructor(private readonly ds: DataSource) {}

  /**
   * Walk the chain for `tableName` scoped to `tenantId`.
   *
   * Returns:
   *   - `{ valid: true, eventsChecked: N }` when every row satisfies both
   *     `row_hash === sha256(prev_hash || canonical_payload)` AND
   *     `prev_hash === <previous row's row_hash>`.
   *   - `{ valid: false, brokenAt }` at the first violation.
   */
  async verifyChain(
    tableName: ChainTableName,
    tenantId: string,
    opts: VerifyChainOptions = {},
  ): Promise<ChainVerifyResult> {
    const payloadSql = CANONICAL_PAYLOAD_SQL[tableName];
    if (!payloadSql) {
      throw new Error(`EventChainVerifier: unsupported table '${tableName}'`);
    }

    const params: unknown[] = [tenantId];
    let sinceClause = '';
    if (opts.since) {
      params.push(opts.since.toISOString());
      sinceClause = ` AND occurred_at_utc >= $${params.length}`;
    }

    // If the table does not exist yet (W2/W3 haven't run), treat as empty.
    const exists = await this.tableExists(tableName);
    if (!exists) {
      return { valid: true, eventsChecked: 0 };
    }

    const rows: ChainRow[] = await this.ds.query(
      `SELECT id, prev_hash, row_hash,
              ${payloadSql} AS canonical_payload
         FROM ${tableName}
        WHERE tenant_id = $1${sinceClause}
        ORDER BY occurred_at_utc ASC, id ASC`,
      params,
    );

    let prev: Buffer = GENESIS_PREV_HASH;
    let eventsChecked = 0;

    for (const r of rows) {
      const storedPrev = Buffer.from(r.prev_hash);
      const storedRow = Buffer.from(r.row_hash);
      const payload = Buffer.from(r.canonical_payload);

      // Link check: this row's prev_hash must equal the previous row_hash
      // (or genesis for the first row).
      if (!storedPrev.equals(prev)) {
        return {
          valid: false,
          eventsChecked,
          brokenAt: {
            id: r.id,
            expected_hex: prev.toString('hex'),
            found_hex: storedPrev.toString('hex'),
            reason: eventsChecked === 0 ? 'genesis_non_zero_prev_hash' : 'phantom_event_inserted',
          },
        };
      }

      // Hash check: row_hash must equal sha256(prev_hash || canonical_payload).
      const expected = computeRowHash(storedPrev, payload);
      if (!expected.equals(storedRow)) {
        return {
          valid: false,
          eventsChecked,
          brokenAt: {
            id: r.id,
            expected_hex: expected.toString('hex'),
            found_hex: storedRow.toString('hex'),
            reason: 'row_hash_mismatch',
          },
        };
      }

      prev = storedRow;
      eventsChecked += 1;
    }

    return { valid: true, eventsChecked };
  }

  private async tableExists(tableName: ChainTableName): Promise<boolean> {
    const rows: Array<{ exists: boolean }> = await this.ds.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND table_name = $1
       ) AS exists`,
      [tableName],
    );
    return rows[0]?.exists === true;
  }
}

/**
 * Stateless re-export for callers that want to verify a payload they
 * constructed locally (used by tests to build fixtures).
 */
export function verifyChain(
  rows: Array<{ id: string; prev_hash: Buffer; row_hash: Buffer; canonical_payload: Buffer }>,
): ChainVerifyResult {
  let prev: Buffer = GENESIS_PREV_HASH;
  let eventsChecked = 0;
  for (const r of rows) {
    if (!Buffer.from(r.prev_hash).equals(prev)) {
      return {
        valid: false,
        eventsChecked,
        brokenAt: {
          id: r.id,
          expected_hex: prev.toString('hex'),
          found_hex: Buffer.from(r.prev_hash).toString('hex'),
          reason: eventsChecked === 0 ? 'genesis_non_zero_prev_hash' : 'phantom_event_inserted',
        },
      };
    }
    const expected = computeRowHash(Buffer.from(r.prev_hash), Buffer.from(r.canonical_payload));
    if (!expected.equals(Buffer.from(r.row_hash))) {
      return {
        valid: false,
        eventsChecked,
        brokenAt: {
          id: r.id,
          expected_hex: expected.toString('hex'),
          found_hex: Buffer.from(r.row_hash).toString('hex'),
          reason: 'row_hash_mismatch',
        },
      };
    }
    prev = Buffer.from(r.row_hash);
    eventsChecked += 1;
  }
  return { valid: true, eventsChecked };
}
