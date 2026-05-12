import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { DataSource, EntitySubscriberInterface, EventSubscriber, QueryRunner } from 'typeorm';
import { CLS_KEYS } from '../cls/tenant-context';

/**
 * TenantRlsSubscriber — defense layer 2 of the multi-tenant model (D-07).
 *
 * Emits `SELECT set_config('app.tenant_id', $1, true)` (is_local=true) at the
 * start of every transaction so Postgres RLS policies bind to the right tenant.
 *
 * `set_config(..., is_local=true)` is REQUIRED for PgBouncer transaction-mode
 * pooling (PITFALLS.md #1 — using bare `SET` leaks across pooled connections).
 *
 * Lifecycle:
 *   - afterTransactionStart: inject GUC from CLS.
 *   - afterTransactionRollback / afterTransactionCommit: GUC is auto-cleared by Postgres.
 *
 * Wired in AppModule (plan W1-P04 wires it together with the JWT guard).
 */
@Injectable()
@EventSubscriber()
export class TenantRlsSubscriber implements EntitySubscriberInterface {
  constructor(
    dataSource: DataSource,
    private readonly cls: ClsService,
  ) {
    dataSource.subscribers.push(this);
  }

  async afterTransactionStart(event: { queryRunner: QueryRunner }): Promise<void> {
    const tenantId = this.cls.get<string>(CLS_KEYS.TENANT_ID);
    const bypass = this.cls.get<boolean>(CLS_KEYS.BYPASS_RLS);

    if (bypass) {
      // Used by trusted maintenance jobs only. JWT-bound requests never set this.
      await event.queryRunner.query("SELECT set_config('app.bypass_rls', 'on', true)");
      return;
    }

    if (!tenantId) {
      // No tenant context = no DB access. Surfacing this fast prevents accidental
      // cross-tenant queries in background jobs that forgot to SET CONTEXT.
      return;
    }

    // PgBouncer transaction-mode SAFE: third arg `true` makes the setting local
    // to the current transaction. Connection is returned to pool without leak.
    await event.queryRunner.query('SELECT set_config($1, $2, true)', [
      'app.tenant_id',
      tenantId,
    ]);
  }
}
