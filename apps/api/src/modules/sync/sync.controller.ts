import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Put,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, QueryRunner } from 'typeorm';
import { ConflictRegistry } from './registry';

/**
 * Sync controller — server-side write path proxied through NestJS
 * (per RESEARCH.md decision: no direct DB writes from PowerSync clients,
 * so we keep RLS + audit + validation invariants in one funnel).
 *
 * Endpoints:
 *   POST /api/sync/activity-log    — batched append_only_event mutations
 *   PUT  /api/sync/preferences     — LWW preference replica writes
 *   GET  /api/sync/registry        — ConflictRegistry (docs/debug)
 *
 * Idempotency: every mutation envelope carries (client_id, client_seq).
 * The (client_id, client_seq) UNIQUE constraint on each table turns retries
 * into ON CONFLICT DO NOTHING, returning the previously-stored row.
 */
@Controller('api/sync')
export class SyncController {
  private readonly logger = new Logger(SyncController.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  @Get('registry')
  getRegistry(): Record<string, unknown> {
    return ConflictRegistry as Record<string, unknown>;
  }

  /**
   * Accept a batch of daily_activity_log envelopes from a client.
   * Server-side ordering is canonical (BIGSERIAL `sequence`). The client
   * MUST NOT supply a sequence or server_received_at — those are server-owned.
   */
  @Post('activity-log')
  @HttpCode(HttpStatus.OK)
  async pushActivityLog(
    @Body() body: { mutations: ActivityLogMutation[] },
  ): Promise<{ accepted: number; duplicates: number; ids: string[] }> {
    const mutations = body?.mutations ?? [];
    if (!Array.isArray(mutations) || mutations.length === 0) {
      throw new BadRequestException('mutations[] required');
    }
    if (mutations.length > 200) {
      throw new BadRequestException('Batch too large (max 200)');
    }

    const ids: string[] = [];
    let accepted = 0;
    let duplicates = 0;

    const qr: QueryRunner = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      for (const m of mutations) {
        this.validateActivityLog(m);
        const result: Array<{ id: string }> = await qr.query(
          `INSERT INTO daily_activity_log
             (id, tenant_id, site_id, shift_id, operational_day_id, author_user_id,
              captured_at_local, client_id, client_seq, notes, photo_sha256)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (client_id, client_seq) DO NOTHING
           RETURNING id`,
          [
            m.id,
            m.tenantId,
            m.siteId,
            m.shiftId ?? null,
            m.operationalDayId ?? null,
            m.authorUserId,
            m.capturedAtLocal,
            m.clientId,
            m.clientSeq,
            m.notes,
            m.photoSha256 ?? null,
          ],
        );
        if (result.length === 1) {
          accepted += 1;
          ids.push(result[0].id);
        } else {
          duplicates += 1;
          // Idempotent retry: look up the canonical id stored on the first attempt.
          const existing: Array<{ id: string }> = await qr.query(
            `SELECT id FROM daily_activity_log
              WHERE client_id = $1 AND client_seq = $2`,
            [m.clientId, m.clientSeq],
          );
          if (existing.length === 1) ids.push(existing[0].id);
        }
      }
      await qr.commitTransaction();
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }

    this.logger.log(
      `activity-log batch: accepted=${accepted} duplicates=${duplicates} total=${mutations.length}`,
    );
    return { accepted, duplicates, ids };
  }

  /**
   * Last-write-wins replica write for user_preferences.
   * Resolution: server_received_at = now(); a later request supersedes
   * an earlier one for the same (user_id, key).
   */
  @Put('preferences')
  @HttpCode(HttpStatus.OK)
  async putPreference(@Body() body: PreferenceMutation): Promise<{
    userId: string;
    key: string;
    serverReceivedAt: string;
    superseded: boolean;
  }> {
    this.validatePreference(body);
    const qr: QueryRunner = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const rows: Array<{ user_id: string; key: string; server_received_at: string }> =
        await qr.query(
          `INSERT INTO user_preferences
             (user_id, tenant_id, key, value, client_id, client_seq)
           VALUES ($1,$2,$3,$4::jsonb,$5,$6)
           ON CONFLICT (user_id, key) DO UPDATE
             SET value              = EXCLUDED.value,
                 client_id          = EXCLUDED.client_id,
                 client_seq         = EXCLUDED.client_seq,
                 server_received_at = now(),
                 updated_at         = now()
             WHERE user_preferences.server_received_at < now()
           RETURNING user_id, key, server_received_at`,
          [body.userId, body.tenantId, body.key, JSON.stringify(body.value), body.clientId, body.clientSeq],
        );
      await qr.commitTransaction();

      if (rows.length === 1) {
        return {
          userId: rows[0].user_id,
          key: rows[0].key,
          serverReceivedAt: rows[0].server_received_at,
          superseded: false,
        };
      }
      // Race: the existing row already had a later server_received_at — caller's write is stale.
      const fallback: Array<{ server_received_at: string }> = await qr.query(
        `SELECT server_received_at FROM user_preferences
          WHERE user_id = $1 AND key = $2`,
        [body.userId, body.key],
      );
      return {
        userId: body.userId,
        key: body.key,
        serverReceivedAt: fallback[0]?.server_received_at ?? new Date().toISOString(),
        superseded: true,
      };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  private validateActivityLog(m: ActivityLogMutation): void {
    if (!m || typeof m !== 'object') throw new BadRequestException('mutation must be object');
    requireUuid(m.id, 'id');
    requireUuid(m.tenantId, 'tenantId');
    requireUuid(m.siteId, 'siteId');
    requireUuid(m.authorUserId, 'authorUserId');
    if (typeof m.clientId !== 'string' || m.clientId.length === 0)
      throw new BadRequestException('clientId required');
    if (!Number.isFinite(m.clientSeq) || m.clientSeq < 0)
      throw new BadRequestException('clientSeq must be a non-negative number');
    if (typeof m.notes !== 'string') throw new BadRequestException('notes required');
    if (m.notes.length > 500) throw new BadRequestException('notes exceeds 500 chars');
    if (m.capturedAtLocal == null) throw new BadRequestException('capturedAtLocal required');
    // D-14 enforcement: clients MUST NOT submit any ordering field.
    // We don't read m.sequence or m.serverReceivedAt — even if present, the DB ignores them.
  }

  private validatePreference(p: PreferenceMutation): void {
    if (!p || typeof p !== 'object') throw new BadRequestException('preference required');
    requireUuid(p.userId, 'userId');
    requireUuid(p.tenantId, 'tenantId');
    if (typeof p.key !== 'string' || p.key.length === 0)
      throw new BadRequestException('key required');
    if (p.value === undefined) throw new BadRequestException('value required');
    if (typeof p.clientId !== 'string' || p.clientId.length === 0)
      throw new BadRequestException('clientId required');
    if (!Number.isFinite(p.clientSeq) || p.clientSeq < 0)
      throw new BadRequestException('clientSeq must be a non-negative number');
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function requireUuid(v: unknown, name: string): void {
  if (typeof v !== 'string' || !UUID_RE.test(v)) {
    throw new BadRequestException(`${name} must be a UUID`);
  }
}

export interface ActivityLogMutation {
  id: string;
  tenantId: string;
  siteId: string;
  shiftId?: string | null;
  operationalDayId?: string | null;
  authorUserId: string;
  capturedAtLocal: string; // ISO local timestamp (no offset)
  clientId: string;
  clientSeq: number;
  notes: string;
  photoSha256?: string | null;
}

export interface PreferenceMutation {
  userId: string;
  tenantId: string;
  key: string;
  value: unknown;
  clientId: string;
  clientSeq: number;
}
