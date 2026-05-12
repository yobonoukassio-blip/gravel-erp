---
phase: 01-foundation
plan: 03
type: execute
wave: 2
depends_on: [01, 02]
files_modified:
  - apps/api/src/modules/sync/sync.module.ts
  - apps/api/src/modules/sync/registry.ts
  - apps/api/src/modules/sync/sync.controller.ts
  - apps/api/src/modules/sync/powersync-rules.yaml
  - apps/api/src/modules/sync/daily-activity-log.entity.ts
  - apps/api/src/migrations/1715600000000__create_daily_activity_log.sql
  - apps/api/src/migrations/1715600100000__powersync_publication.sql
  - apps/api/test/chaos/sync-chaos.spec.ts
  - apps/mobile/lib/core/db/database.dart
  - apps/mobile/lib/core/db/database.g.dart
  - apps/mobile/lib/core/sync/powersync_connector.dart
  - apps/mobile/lib/core/sync/conflict_policy.dart
  - apps/mobile/lib/features/activity_log/activity_log_repository.dart
  - apps/mobile/lib/features/activity_log/activity_log_screen.dart
  - apps/mobile/lib/features/activity_log/activity_log_form.dart
  - apps/mobile/lib/features/activity_log/sync_status_badge.dart
  - apps/mobile/integration_test/sync_offline_test.dart
  - apps/mobile/test/helpers/sync_harness.dart
  - infra/helm/powersync/values.yaml
  - infra/helm/powersync/Chart.yaml
autonomous: true
requirements: [FND-10, FND-11]
must_haves:
  truths:
    - "An offline mobile device captures a daily_activity_log row, persists it to local Drift SQLite, and re-syncs without loss or duplicate once connectivity returns"
    - "Two clients editing the same daily_activity_log (append_only_event strategy) both produce rows server-side — no silent merge"
    - "Two clients editing user_preferences (last_write_wins strategy) converge deterministically by server_received_at timestamp"
    - "No `device.now()` is used to order events — Lamport / server_received_at + sequence is canonical"
    - "Mobile sync indicator shows 3 states: synced / pending / error"
  artifacts:
    - path: "apps/api/src/modules/sync/registry.ts"
      provides: "ConflictRegistry mapping entity name → ConflictPolicy"
      contains: "daily_activity_log"
    - path: "apps/api/src/modules/sync/powersync-rules.yaml"
      provides: "PowerSync sync rules scoped by app.tenant_id and site_ids"
    - path: "apps/mobile/lib/core/sync/powersync_connector.dart"
      provides: "PowerSyncConnector bridging Drift SQLite ↔ PowerSync service"
    - path: "apps/mobile/integration_test/sync_offline_test.dart"
      provides: "Offline capture + reconnect round-trip test (FND-10)"
    - path: "apps/api/test/chaos/sync-chaos.spec.ts"
      provides: "Split-brain test for append_only_event + last_write_wins strategies"
  key_links:
    - from: "apps/mobile activity_log_screen"
      to: "Drift database"
      via: "ActivityLogRepository.insert"
      pattern: "powerSync.execute"
    - from: "PowerSync service"
      to: "Postgres daily_activity_log table"
      via: "logical replication slot + sync rules"
      pattern: "wal_level=logical"
---

<objective>
Sync framework + mobile shell + the single round-trip feature that proves FND-10/FND-11. Backend: PowerSync server deployed via Helm (depends on RDS wal_level=logical from plan 01); NestJS `sync` module exposes ConflictRegistry (D-11), one real entity `daily_activity_log` with strategy `append_only_event` + `user_preferences` with `last_write_wins`; chaos harness in CI. Mobile: Flutter shell wires Drift schema, PowerSync connector, the journal d'activité quotidien form (date, site_id, shift_id, notes ≤500, optional photo) with offline persistence and sync indicator, integration_test for offline round-trip. Honors D-14 (NO device.now() ordering; uses server_received_at + sequence). NOTE: Keycloak OIDC mobile auth wiring lives in plan 04 — this plan uses a mock token for the round-trip test.

Wave note: this plan depends on plan 02 (data platform) because it (a) uses `apps/api/scripts/generate-audit-triggers.ts` regenerated for new tables, (b) FKs `daily_activity_log` to `sites`/`shifts`/`operational_days` created in plan 02, and (c) extends the RLS pattern established by plan 02's TenantRlsSubscriber. It runs in Wave 2 in parallel with plan 04 (identity + i18n). The locale source-of-truth (`users.preferred_locale`) is owned by plan 04 via `PUT /api/users/me/preferences`; the sync replica row in `user_preferences` (LWW) is reconciled via CDC — both endpoints coexist by design.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/phases/01-foundation/01-CONTEXT.md
@.planning/phases/01-foundation/01-RESEARCH.md
@.planning/phases/01-foundation/01-VALIDATION.md
@.planning/research/PITFALLS.md

<interfaces>
From packages/shared-types/src/conflict-policy.ts:
```ts
export type ConflictPolicy =
  | { strategy: 'append_only_event' }
  | { strategy: 'event_sourced_ledger'; foldFn: string }
  | { strategy: 'pessimistic_lock'; lockTtlSec: number }
  | { strategy: 'last_write_wins' };
```

Phase-1 sync scope (D-12): only `daily_activity_log` (append_only_event) and `user_preferences` (last_write_wins) are wired end-to-end. Framework supports all 4 strategies; other entities added in their phases.

RDS parameter group from plan 01 already has wal_level=logical, max_replication_slots=20.

From plan 02: `apps/api/scripts/generate-audit-triggers.ts`, the `sites`/`shifts`/`operational_days` tables, and the `TenantRlsSubscriber` + RLS policy pattern.
</interfaces>
</context>

<tasks>

<task type="auto" id="W2-P03-T01" tdd="true">
  <name>Backend sync module: ConflictRegistry, daily_activity_log entity, PowerSync rules</name>
  <files>apps/api/src/modules/sync/sync.module.ts, apps/api/src/modules/sync/registry.ts, apps/api/src/modules/sync/sync.controller.ts, apps/api/src/modules/sync/daily-activity-log.entity.ts, apps/api/src/modules/sync/powersync-rules.yaml, apps/api/src/migrations/1715600000000__create_daily_activity_log.sql, apps/api/src/migrations/1715600100000__powersync_publication.sql</files>
  <read_first>
    - .planning/phases/01-foundation/01-CONTEXT.md (D-10, D-11, D-12, D-14, D-35)
    - .planning/phases/01-foundation/01-RESEARCH.md (Pattern 4 lines 454-472; Pitfall 3 logical-slot exhaustion; Pitfall 5 Drift schema drift)
  </read_first>
  <behavior>
    - Test: ConflictRegistry exports 'daily_activity_log' → {strategy: 'append_only_event'} and 'user_preferences' → {strategy: 'last_write_wins'}
    - Test: Inserting a daily_activity_log row triggers an audit_log entry (inherits W1-P02 audit triggers)
    - Test: daily_activity_log carries tenant_id (RLS scoped) AND server_received_at TIMESTAMPTZ DEFAULT now() AND sequence BIGSERIAL (per D-14, NOT device.now())
    - Test: PUT /api/sync/preferences with same key from two clients in sequence — final value matches last server_received_at order (this is the sync proxy / replica path; canonical user-locale source-of-truth row in `users.preferred_locale` is updated atomically by plan 04's `PUT /api/users/me/preferences`)
    - Test: PowerSync rules file references `current_setting('app.tenant_id')` and `site_ids` from JWT
  </behavior>
  <action>
    `1715600000000__create_daily_activity_log.sql`:
      ```sql
      CREATE TABLE daily_activity_log (
        id UUID PRIMARY KEY,  -- assigned client-side, server validates uniqueness
        tenant_id UUID NOT NULL,
        site_id UUID NOT NULL REFERENCES sites(id),
        shift_id UUID NULL REFERENCES shifts(id),
        operational_day_id UUID NULL REFERENCES operational_days(id),
        author_user_id UUID NOT NULL,
        captured_at_local TIMESTAMP NOT NULL,    -- local time as observed by operator
        client_id TEXT NOT NULL,                  -- device id
        client_seq BIGINT NOT NULL,               -- monotonic per client; for idempotency
        server_received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        sequence BIGSERIAL,                       -- canonical ordering per D-14
        notes TEXT NOT NULL CHECK (length(notes) <= 500),
        photo_sha256 TEXT NULL,                   -- optional, S3 content-addressed
        UNIQUE(client_id, client_seq)             -- idempotency on resync
      );
      ALTER TABLE daily_activity_log ENABLE ROW LEVEL SECURITY;
      ALTER TABLE daily_activity_log FORCE ROW LEVEL SECURITY;
      CREATE POLICY dal_isolation ON daily_activity_log FOR ALL TO gravel_app
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
      CREATE INDEX dal_site_seq_idx ON daily_activity_log (site_id, sequence);

      -- user_preferences (last_write_wins target — sync replica.
      -- Canonical source-of-truth for user locale lives in `users.preferred_locale`,
      -- updated by plan 04 via PUT /api/users/me/preferences; CDC reconciles this row.)
      CREATE TABLE user_preferences (
        user_id UUID NOT NULL,
        tenant_id UUID NOT NULL,
        key TEXT NOT NULL,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        client_id TEXT NOT NULL,
        client_seq BIGINT NOT NULL,
        server_received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, key)
      );
      ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
      ALTER TABLE user_preferences FORCE ROW LEVEL SECURITY;
      CREATE POLICY up_isolation ON user_preferences FOR ALL TO gravel_app
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
      ```
    `1715600100000__powersync_publication.sql`:
      ```sql
      CREATE PUBLICATION powersync FOR TABLE daily_activity_log, user_preferences;
      -- Logical replication slot is created by PowerSync server (see Helm values)
      ```
    `apps/api/src/modules/sync/registry.ts`: per RESEARCH Pattern 4 — exports `ConflictRegistry: Record<string, ConflictPolicy>` with both entries. Future-proof: a `@SyncEntity()` decorator stub is acceptable but not required.
    `apps/api/src/modules/sync/daily-activity-log.entity.ts`: TypeORM entity.
    `apps/api/src/modules/sync/powersync-rules.yaml` — PowerSync sync rules:
      ```yaml
      bucket_definitions:
        global_user:
          parameters: select request.jwt() -> 'tenant_id' as tenant_id, request.jwt() -> 'site_ids' as site_ids
          data:
            - select * from daily_activity_log where tenant_id = bucket.tenant_id::uuid and site_id::text = ANY(bucket.site_ids::text[])
            - select * from user_preferences where tenant_id = bucket.tenant_id::uuid and user_id = (request.jwt() -> 'sub')::uuid
      ```
    `apps/api/src/modules/sync/sync.controller.ts`:
      - `POST /api/sync/activity-log` (server-validates client-pushed envelope, idempotent by (client_id, client_seq))
      - `PUT /api/sync/preferences` (LWW sync proxy; replaces by (user_id, key) ordered by server_received_at). NOTE: this is the sync-replica write path used by mobile/web background sync; the canonical user-locale source-of-truth is `users.preferred_locale`, updated by plan 04's `PUT /api/users/me/preferences` (TypeORM + audit). Both endpoints coexist; the canonical row is propagated to this replica via CDC.
      - `GET /api/sync/registry` returns the ConflictRegistry for documentation/debug
    `apps/api/src/modules/sync/sync.module.ts`: TypeOrmModule.forFeature, controllers, providers.

    Update `apps/api/scripts/generate-audit-triggers.ts` rerun → `1715500700000__generate_audit_triggers.sql` regenerated to include `daily_activity_log` + `user_preferences`.
  </action>
  <verify>
    <automated>pnpm --filter @gravel/api migration:run && pnpm --filter @gravel/api test:int -- sync 2>&1 | tail -30</automated>
  </verify>
  <acceptance_criteria>
    - Migrations 1715600000000 + 1715600100000 apply cleanly
    - `daily_activity_log.sequence` is BIGSERIAL (NOT a wall-clock timestamp)
    - `(client_id, client_seq)` UNIQUE — idempotent resync
    - PowerSync publication exists: `SELECT pubname FROM pg_publication` includes `powersync`
    - `ConflictRegistry` has both entries
    - audit triggers regenerated and now include `daily_activity_log` (RLS-leak generator will pick it up automatically)
  </acceptance_criteria>
  <done>Backend sync surface live; ConflictRegistry framework in place; only 2 entities wired (Phase-1 scope per D-12).</done>
</task>

<task type="auto" id="W2-P03-T02" tdd="true">
  <name>Mobile Drift schema + PowerSync connector + activity log feature with sync badge</name>
  <files>apps/mobile/lib/core/db/database.dart, apps/mobile/lib/core/db/database.g.dart, apps/mobile/lib/core/sync/powersync_connector.dart, apps/mobile/lib/core/sync/conflict_policy.dart, apps/mobile/lib/features/activity_log/activity_log_repository.dart, apps/mobile/lib/features/activity_log/activity_log_screen.dart, apps/mobile/lib/features/activity_log/activity_log_form.dart, apps/mobile/lib/features/activity_log/sync_status_badge.dart</files>
  <read_first>
    - .planning/phases/01-foundation/01-CONTEXT.md (D-34, D-35)
    - .planning/phases/01-foundation/01-RESEARCH.md (Pitfall 5 Drift schema drift; Pitfall 10 photo + content-addressed storage)
  </read_first>
  <behavior>
    - Drift table `DailyActivityLog` mirrors Postgres columns (id TEXT, tenant_id TEXT, site_id TEXT, shift_id TEXT?, captured_at_local DateTime, notes TEXT, photo_sha256 TEXT?, client_id TEXT, client_seq INT, sync_state TEXT)
    - Test: `ActivityLogRepository.insert(notes, photo?)` writes locally with sync_state='pending'; returns id
    - Test: PowerSync upload + ack changes sync_state to 'synced'
    - Test: Failed upload → sync_state='error' with retry button
    - Widget test: `SyncStatusBadge` renders one of `Icons.cloud_done`, `Icons.cloud_upload`, `Icons.cloud_off` per state
    - Widget test: `ActivityLogForm` validates notes ≤500 chars; photo optional
  </behavior>
  <action>
    `lib/core/db/database.dart`: Drift `@DriftDatabase` with `DailyActivityLog` and `UserPreferences` tables matching Postgres schema. Use `sqlite_async` for the underlying engine (PowerSync requirement). Run `dart run build_runner build` to produce `database.g.dart`.

    `lib/core/sync/powersync_connector.dart`:
      ```dart
      final powerSync = PowerSyncDatabase(schema: appSchema, path: dbPath);
      class GravelBackendConnector extends PowerSyncBackendConnector {
        @override
        Future<PowerSyncCredentials?> fetchCredentials() async {
          final token = await secureStorage.read(key: 'access_token');
          return PowerSyncCredentials(endpoint: env.powerSyncUrl, token: token!);
        }
        @override
        Future<void> uploadData(PowerSyncDatabase database) async {
          final batch = await database.getCrudBatch();
          if (batch == null) return;
          // POST to /api/sync/activity-log with (client_id, client_seq) idempotency
          ...
          await batch.complete();
        }
      }
      ```
    `lib/core/sync/conflict_policy.dart`: mirrors ConflictPolicy types from `@gravel/shared-types` (manually kept in sync for now; future codegen — see Pitfall 5 CI diff check).

    `lib/features/activity_log/activity_log_repository.dart`: Riverpod-exposed repo with `insert(notes, photo?)`, `watchAll()`, `retry(id)`.

    `lib/features/activity_log/activity_log_form.dart`: stateful form (date defaults today; site_id from current user session; shift_id optional dropdown; notes TextField maxLength 500; photo via image_picker → SHA-256 hashed → stored in app docs dir).

    `lib/features/activity_log/activity_log_screen.dart`: list of past entries (Drift watchAll), FAB to open form, AppBar shows `SyncStatusBadge`.

    `lib/features/activity_log/sync_status_badge.dart`: Riverpod consumer reading PowerSync `StatusStream`; renders one of 3 states.

    Update `lib/app/app.dart` to register routes and seed PowerSync at app start. Note that auth integration (real Keycloak token) lands in plan 04 — for now read token from `--dart-define=GRAVEL_FAKE_TOKEN=...`.
  </action>
  <verify>
    <automated>cd apps/mobile && dart run build_runner build --delete-conflicting-outputs && flutter test test/widget/activity_log_form_test.dart 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `database.g.dart` generated (Drift codegen)
    - `powersync_connector.dart` does NOT use `DateTime.now()` for any ordering field — only for display/captured_at_local
    - `activity_log_form.dart` enforces notes maxLength=500
    - `sync_status_badge.dart` widget test passes for all 3 states
    - `flutter analyze` exits 0
  </acceptance_criteria>
  <done>Mobile feature complete; ready for offline integration test in next task.</done>
</task>

<task type="auto" id="W2-P03-T03" tdd="true">
  <name>Integration test: offline round-trip (FND-10) + chaos harness (FND-11)</name>
  <files>apps/mobile/integration_test/sync_offline_test.dart, apps/mobile/test/helpers/sync_harness.dart, apps/api/test/chaos/sync-chaos.spec.ts, infra/helm/powersync/values.yaml, infra/helm/powersync/Chart.yaml</files>
  <read_first>
    - .planning/phases/01-foundation/01-CONTEXT.md (D-13, D-14)
    - .planning/phases/01-foundation/01-RESEARCH.md (Pitfall 3 PowerSync logical slot)
    - .planning/research/PITFALLS.md (Pitfall #3)
  </read_first>
  <behavior>
    Mobile (FND-10):
    - Test setup: spin up Postgres 18 + PowerSync server (via dart_periphery dev container OR Testcontainers from host)
    - Step 1: bring connector OFFLINE → user fills form → submits → row appears locally with sync_state='pending'
    - Step 2: kill app, restart → row still present, sync_state='pending'
    - Step 3: bring connector ONLINE → wait for ack → row sync_state='synced'
    - Step 4: assert server row matches client row (id, notes, photo_sha256) — exactly once
    - Step 5: submit same row twice (simulate retry) → server has 1 row (idempotency via (client_id, client_seq))

    Backend chaos (FND-11):
    - Test (append_only_event): 2 simulated clients A and B insert different daily_activity_log rows offline; both upload after a delay; server has BOTH rows, neither overwritten
    - Test (append_only_event idempotency): client A retries the same (client_id, client_seq) — server has 1 row
    - Test (last_write_wins): 2 clients set the same user_preferences key concurrently; server applies the one with greater server_received_at; older one observable in audit_log
    - Test (no device.now): inject a client envelope with `client_seq` matching but server_received_at differing — server orders by sequence (BIGSERIAL), NOT by any client timestamp; verify via the resulting `sequence` order matches order of arrival
  </behavior>
  <action>
    `infra/helm/powersync/Chart.yaml` + `values.yaml`: deploy `journeyapps/powersync-service` image; configure:
      - `replicaCount: 1` (per Pitfall 3 — single instance Phase 1)
      - `env.DATABASE_URL` from secret
      - `env.POWERSYNC_SYNC_RULES_PATH: /etc/powersync/rules.yaml` (mount from ConfigMap built from `apps/api/src/modules/sync/powersync-rules.yaml`)
      - `service.port: 8080`
      - ADR-0002 note inline: "Phase-1 single replica; multi-replica deferred to Phase 6"

    `apps/mobile/test/helpers/sync_harness.dart`: replace stub. Expose:
      - `Future<void> startBackend()` — boots Postgres + PowerSync via Testcontainers (using package `testcontainers` for Dart) OR delegates to a script
      - `Future<void> bringOffline(PowerSyncDatabase db)` → `db.disconnect()`
      - `Future<void> bringOnline(PowerSyncDatabase db, connector)` → `db.connect(connector: connector)`
      - `Future<int> serverRowCount(String table)` via direct psql

    `apps/mobile/integration_test/sync_offline_test.dart`: replace stub. Implement the 5 steps above for FND-10.

    `apps/api/test/chaos/sync-chaos.spec.ts`: replace stub. Implement append_only_event and last_write_wins chaos scenarios using direct DB inserts with simulated `client_id`/`client_seq`/`server_received_at` and assert via SQL.

    Add CI step in `.github/workflows/test.yml` mobile job: `flutter test integration_test/sync_offline_test.dart --device-id=linux` (using flutter_test in headless mode).
  </action>
  <verify>
    <automated>pnpm --filter @gravel/api test:chaos && cd apps/mobile && flutter test integration_test/sync_offline_test.dart</automated>
  </verify>
  <acceptance_criteria>
    - `sync_offline_test.dart` exits 0 — offline capture + reconnect + sync round-trip works
    - `sync-chaos.spec.ts` exits 0 — both append_only and LWW scenarios green
    - Helm chart for PowerSync renders: `helm template infra/helm/powersync` succeeds
    - No `device.now()` references in mobile sync code (`grep -r "DateTime.now()" apps/mobile/lib/core/sync/` returns 0 hits)
    - Idempotency: retried upload produces 1 server row, not 2
    - FND-10 and FND-11 verification commands in 01-VALIDATION.md flip green
  </acceptance_criteria>
  <done>Round-trip proven end-to-end; chaos harness blocking on red in CI; conflict policy framework operational.</done>
</task>

</tasks>

<verification>
- `pnpm --filter @gravel/api test:int -- sync` passes
- `pnpm --filter @gravel/api test:chaos` passes (append_only + LWW)
- `cd apps/mobile && flutter test integration_test/sync_offline_test.dart` passes
- `helm template infra/helm/powersync` renders without error
- ConflictRegistry has 2 entries (daily_activity_log + user_preferences) — D-12 scope respected
</verification>

<success_criteria>
- FND-10 and FND-11 both backed by green automated tests
- The journal d'activité quotidien round-trips offline → online without loss/duplicate (deterministic)
- Framework supports the 4 strategies even though only 2 entities use it in Phase 1
- No clock-drift dependency anywhere in ordering paths
</success_criteria>

<output>
After completion create `.planning/phases/01-foundation/01-W2-P03-SUMMARY.md` listing: sync module files, ConflictRegistry contents, Helm chart values, PowerSync rule scope, mobile screens shipped, and observed sync latency from chaos test.
</output>
