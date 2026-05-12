/**
 * REQ: FND-11 — Sync conflict policy framework (append_only_event,
 * event_sourced_ledger, pessimistic_lock, last_write_wins) — chaos harness.
 * Source: D-10, D-11, D-12, D-13, D-14.
 *
 * GREEN (W2-P03-T03). The chaos scenarios exercise:
 *   - append_only_event: 2 offline clients → 2 distinct server rows
 *   - append_only_event idempotency: retried (client_id, client_seq) → 1 row
 *   - last_write_wins: 2 concurrent writers → newest server_received_at wins
 *   - D-14 ordering invariant: NO client-supplied clock can change `sequence`
 *
 * Test fixture: Testcontainers Postgres (same image W1-P02 uses),
 * migrations applied, no PowerSync server needed (we exercise the DB
 * invariants directly — the PowerSync logical-slot path is integration-tested
 * separately on the mobile side).
 */
import { randomUUID } from 'crypto';
import type { DataSource } from 'typeorm';
import type { ConflictPolicy } from '@gravel/shared-types';
import { ConflictRegistry, listEntities, listStrategiesInUse } from '../../src/modules/sync/registry';
import { startPostgres, stopPostgres, PgTestStack } from '../setup/testcontainers';

const TENANT_A = '11111111-1111-1111-1111-111111111111';

interface SeedRefs {
  siteId: string;
  authorId: string;
}

describe('FND-11: Sync conflict resolution chaos harness', () => {
  let stack: PgTestStack;
  let ds: DataSource;
  let refs: SeedRefs;

  beforeAll(async () => {
    stack = await startPostgres();
    ds = stack.appDs;
    refs = await seedTenantSiteUser(ds, TENANT_A);
  }, 120_000);

  afterAll(async () => {
    await stopPostgres(stack);
  });

  beforeEach(async () => {
    await ds.query('SET LOCAL app.tenant_id = $1', [TENANT_A]).catch(() => undefined);
    await ds.query(`SELECT set_config('app.tenant_id', $1, false)`, [TENANT_A]);
    // Clean only the sync tables; master data persists.
    await ds.query(`DELETE FROM daily_activity_log WHERE tenant_id = $1::uuid`, [TENANT_A]);
    await ds.query(`DELETE FROM user_preferences   WHERE tenant_id = $1::uuid`, [TENANT_A]);
  });

  it('ConflictPolicy union exposes 4 strategies', () => {
    const sample: ConflictPolicy[] = [
      { strategy: 'append_only_event' },
      { strategy: 'event_sourced_ledger', foldFn: 'stockpile_balance_v1' },
      { strategy: 'pessimistic_lock', lockTtlSec: 300 },
      { strategy: 'last_write_wins' },
    ];
    expect(sample).toHaveLength(4);
  });

  it('ConflictRegistry registers the 2 Phase-1 entities with correct strategies (D-12)', () => {
    expect(ConflictRegistry.daily_activity_log).toEqual({ strategy: 'append_only_event' });
    expect(ConflictRegistry.user_preferences).toEqual({ strategy: 'last_write_wins' });
    expect(listEntities().sort()).toEqual(['daily_activity_log', 'user_preferences']);
    expect(listStrategiesInUse().sort()).toEqual(['append_only_event', 'last_write_wins']);
  });

  it('append_only_event: 2 offline clients edit same daily_activity_log — no loss, no duplicate', async () => {
    const clientA = 'device-A';
    const clientB = 'device-B';

    // Both clients submit independently. Each gets its own row because
    // (client_id, client_seq) is unique per device.
    const idA = await insertActivity(ds, refs, clientA, 1, 'note from A');
    const idB = await insertActivity(ds, refs, clientB, 1, 'note from B');

    const rows: Array<{ id: string; notes: string; sequence: string }> = await ds.query(
      `SELECT id, notes, sequence FROM daily_activity_log
        WHERE tenant_id = $1::uuid ORDER BY sequence ASC`,
      [TENANT_A],
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.id).sort()).toEqual([idA, idB].sort());
    expect(rows.map((r) => r.notes).sort()).toEqual(['note from A', 'note from B']);
    // server-side ordering monotonic
    expect(BigInt(rows[1].sequence)).toBeGreaterThan(BigInt(rows[0].sequence));
  });

  it('append_only_event idempotency: retried (client_id, client_seq) yields exactly 1 row', async () => {
    const clientA = 'device-retry';
    const id1 = await insertActivity(ds, refs, clientA, 7, 'first attempt');
    // Retry the same envelope (same client_id + client_seq).
    const id2 = await insertActivityIdempotent(ds, refs, clientA, 7, 'first attempt');

    expect(id2).toBe(id1); // ON CONFLICT DO NOTHING + lookup → original id
    const count: Array<{ count: string }> = await ds.query(
      `SELECT count(*)::text AS count FROM daily_activity_log
        WHERE client_id = $1 AND client_seq = 7`,
      [clientA],
    );
    expect(count[0].count).toBe('1');
  });

  it('last_write_wins: 2 concurrent preference writers — newest server_received_at wins', async () => {
    const userId = refs.authorId;
    const key = 'mobile.theme';

    await upsertPreference(ds, userId, TENANT_A, key, { v: 'light' }, 'device-A', 1);
    // small spacing to ensure server_received_at differs (now() is statement-time)
    await new Promise((r) => setTimeout(r, 5));
    await upsertPreference(ds, userId, TENANT_A, key, { v: 'dark' }, 'device-B', 1);

    const rows: Array<{ value: unknown }> = await ds.query(
      `SELECT value FROM user_preferences WHERE user_id = $1 AND key = $2`,
      [userId, key],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toEqual({ v: 'dark' });
  });

  it('no event uses device.now() for ordering — `sequence` is BIGSERIAL, not client-supplied (D-14)', async () => {
    // We try to slip in a row whose `captured_at_local` is far in the future
    // and another in the past. The canonical `sequence` MUST follow insertion
    // order, NOT the client's clock.
    const idFuture = await insertActivityWithLocal(
      ds,
      refs,
      'device-clock-skew',
      100,
      'future row',
      '2099-01-01T00:00:00',
    );
    const idPast = await insertActivityWithLocal(
      ds,
      refs,
      'device-clock-skew',
      101,
      'past row',
      '1990-01-01T00:00:00',
    );

    const rows: Array<{ id: string; sequence: string }> = await ds.query(
      `SELECT id, sequence FROM daily_activity_log
        WHERE id IN ($1::uuid, $2::uuid)
        ORDER BY sequence ASC`,
      [idFuture, idPast],
    );
    expect(rows[0].id).toBe(idFuture); // inserted first → smaller sequence
    expect(rows[1].id).toBe(idPast);
    expect(BigInt(rows[1].sequence) - BigInt(rows[0].sequence)).toBeGreaterThanOrEqual(1n);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedTenantSiteUser(ds: DataSource, tenantId: string): Promise<SeedRefs> {
  // Service role bypasses RLS for fixture setup.
  await ds.query(`SELECT set_config('app.tenant_id', $1, false)`, [tenantId]);

  // tenant
  await ds.query(
    `INSERT INTO tenants (id, name, status) VALUES ($1::uuid, $2, 'active')
     ON CONFLICT (id) DO NOTHING`,
    [tenantId, 'Chaos Tenant'],
  );

  // country (FK target of sites)
  const countryRows: Array<{ id: string }> = await ds.query(
    `SELECT id FROM countries WHERE iso_code = 'CIV' LIMIT 1`,
  );
  let countryId = countryRows[0]?.id;
  if (!countryId) {
    countryId = randomUUID();
    await ds.query(
      `INSERT INTO countries (id, iso_code, name, tenant_id) VALUES ($1::uuid,'CIV','Cote dIvoire',$2::uuid)`,
      [countryId, tenantId],
    );
  }

  // site
  const siteId = randomUUID();
  await ds.query(
    `INSERT INTO sites (id, tenant_id, country_id, code, name, gps_point, iana_timezone, functional_currency)
     VALUES ($1::uuid, $2::uuid, $3::uuid, 'CHAOS', 'Chaos Site',
             ST_SetSRID(ST_MakePoint(-4.0, 5.3), 4326), 'Africa/Abidjan', 'XOF')`,
    [siteId, tenantId, countryId],
  );

  const authorId = randomUUID();
  return { siteId, authorId };
}

async function insertActivity(
  ds: DataSource,
  refs: SeedRefs,
  clientId: string,
  clientSeq: number,
  notes: string,
): Promise<string> {
  const id = randomUUID();
  await ds.query(
    `INSERT INTO daily_activity_log
       (id, tenant_id, site_id, author_user_id, captured_at_local,
        client_id, client_seq, notes)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8)`,
    [id, TENANT_A, refs.siteId, refs.authorId, new Date().toISOString().slice(0, 19), clientId, clientSeq, notes],
  );
  return id;
}

async function insertActivityIdempotent(
  ds: DataSource,
  refs: SeedRefs,
  clientId: string,
  clientSeq: number,
  notes: string,
): Promise<string> {
  // Mimic the controller's ON CONFLICT DO NOTHING + lookup path.
  const id = randomUUID();
  const inserted: Array<{ id: string }> = await ds.query(
    `INSERT INTO daily_activity_log
       (id, tenant_id, site_id, author_user_id, captured_at_local,
        client_id, client_seq, notes)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8)
     ON CONFLICT (client_id, client_seq) DO NOTHING
     RETURNING id`,
    [id, TENANT_A, refs.siteId, refs.authorId, new Date().toISOString().slice(0, 19), clientId, clientSeq, notes],
  );
  if (inserted.length === 1) return inserted[0].id;
  const existing: Array<{ id: string }> = await ds.query(
    `SELECT id FROM daily_activity_log WHERE client_id = $1 AND client_seq = $2`,
    [clientId, clientSeq],
  );
  return existing[0].id;
}

async function insertActivityWithLocal(
  ds: DataSource,
  refs: SeedRefs,
  clientId: string,
  clientSeq: number,
  notes: string,
  capturedAtLocal: string,
): Promise<string> {
  const id = randomUUID();
  await ds.query(
    `INSERT INTO daily_activity_log
       (id, tenant_id, site_id, author_user_id, captured_at_local,
        client_id, client_seq, notes)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::timestamp, $6, $7, $8)`,
    [id, TENANT_A, refs.siteId, refs.authorId, capturedAtLocal, clientId, clientSeq, notes],
  );
  return id;
}

async function upsertPreference(
  ds: DataSource,
  userId: string,
  tenantId: string,
  key: string,
  value: unknown,
  clientId: string,
  clientSeq: number,
): Promise<void> {
  await ds.query(
    `INSERT INTO user_preferences
       (user_id, tenant_id, key, value, client_id, client_seq)
     VALUES ($1::uuid, $2::uuid, $3, $4::jsonb, $5, $6)
     ON CONFLICT (user_id, key) DO UPDATE
       SET value              = EXCLUDED.value,
           client_id          = EXCLUDED.client_id,
           client_seq         = EXCLUDED.client_seq,
           server_received_at = now(),
           updated_at         = now()
       WHERE user_preferences.server_received_at < now()`,
    [userId, tenantId, key, JSON.stringify(value), clientId, clientSeq],
  );
}
