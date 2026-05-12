import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';

export interface ChainVerifyResult {
  valid: boolean;
  /** First row id where the chain breaks (only set when valid=false). */
  brokenAt?: string;
  rowsChecked: number;
}

/**
 * Recompute row_hash[n] = sha256(row_hash[n-1] || canonical_json(payload))
 * for every audit_log row of (tenant, table) in order of id ASC.
 *
 * The trigger writes `canonical_json` as `jsonb_build_object(...)::text`.
 * We replay the SAME jsonb shape and hash it identically.
 *
 * Source: D-28.
 */
@Injectable()
export class AuditChainVerifier {
  constructor(private readonly ds: DataSource) {}

  async verifyChain(tenantId: string, tableName: string): Promise<ChainVerifyResult> {
    const rows: Array<{
      id: string;
      action: string;
      row_pk: string;
      before_jsonb: unknown;
      after_jsonb: unknown;
      prev_hash: Buffer;
      row_hash: Buffer;
    }> = await this.ds.query(
      `SELECT id, action, row_pk, before_jsonb, after_jsonb, prev_hash, row_hash
         FROM audit_log
        WHERE tenant_id = $1 AND table_name = $2
        ORDER BY id ASC`,
      [tenantId, tableName],
    );

    let prev: Buffer = Buffer.from([0x00]);
    for (const r of rows) {
      // Stored hash chain link must match the prev_hash column.
      if (!Buffer.from(r.prev_hash).equals(prev)) {
        return { valid: false, brokenAt: r.id, rowsChecked: rows.length };
      }
      // Recompute payload exactly as the trigger built it.
      const payload = {
        action: r.action,
        table: tableName,
        row_pk: r.row_pk,
        before: r.before_jsonb ?? null,
        after: r.after_jsonb ?? null,
      };
      const text = JSON.stringify(payload);
      // We accept either Node-side recomputation matching stored row_hash OR
      // Postgres-side recomputation (the trigger uses Postgres's jsonb text
      // representation which can re-order keys). To stay deterministic, ask
      // Postgres to recompute and compare bytes.
      const [{ digest }] = await this.ds.query(
        `SELECT digest($1::bytea || convert_to($2::text, 'UTF8'), 'sha256') AS digest`,
        [prev, text],
      );
      // If the JSON we serialized client-side does not match Postgres's
      // canonical jsonb stringification, fall back to comparing prev links
      // only (the chain integrity is still captured by prev_hash chaining).
      void digest;
      // Trust the stored row_hash as the canonical link for the NEXT row;
      // tampering with row_hash without updating prev_hash breaks the chain.
      const stored = Buffer.from(r.row_hash);
      // Detect tampering of before_jsonb/after_jsonb: recompute via Postgres.
      const [{ recomputed }] = await this.ds.query(
        `SELECT digest(
           $1::bytea || convert_to(
             jsonb_build_object(
               'action', $2::text,
               'table',  $3::text,
               'row_pk', $4::text,
               'before', $5::jsonb,
               'after',  $6::jsonb
             )::text, 'UTF8'
           ), 'sha256') AS recomputed`,
        [
          prev,
          r.action,
          tableName,
          r.row_pk,
          r.before_jsonb ?? null,
          r.after_jsonb ?? null,
        ],
      );
      if (!Buffer.from(recomputed).equals(stored)) {
        return { valid: false, brokenAt: r.id, rowsChecked: rows.length };
      }
      prev = stored;
    }
    return { valid: true, rowsChecked: rows.length };
  }

  // Helper for Node-side sha256 — kept for callers that want to verify a
  // payload they constructed locally.
  static sha256(prev: Buffer, payloadText: string): Buffer {
    return createHash('sha256').update(Buffer.concat([prev, Buffer.from(payloadText, 'utf8')])).digest();
  }
}
