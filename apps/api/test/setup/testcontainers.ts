/**
 * Shared Testcontainers fixtures for integration / security / chaos tests.
 *
 * Stack:
 *  - Postgres 18 + PostGIS (image: postgis/postgis:18-3.5)
 *  - Keycloak 26 (image: quay.io/keycloak/keycloak:26.0) — wired by plan W1-P04
 *
 * Implementation (plan W1-P02):
 *  - startPostgres() spins one Postgres+PostGIS container, runs all migrations
 *    in `apps/api/src/migrations/*.sql` IN ORDER, returns two DataSources
 *    (`ownerDs` as gravel_owner for fixtures, `appDs` as gravel_app for RLS tests).
 */
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

export interface PgTestStack {
  container: StartedTestContainer;
  ownerDs: DataSource;
  appDs: DataSource;
  serviceDs: DataSource;
  host: string;
  port: number;
  database: string;
}

const MIGRATIONS_DIR = path.resolve(__dirname, '..', '..', 'src', 'migrations');

export async function startPostgres(): Promise<PgTestStack> {
  const container = await new GenericContainer('postgis/postgis:17-3.5')
    .withEnvironment({
      POSTGRES_USER: 'postgres',
      POSTGRES_PASSWORD: 'postgres',
      POSTGRES_DB: 'gravel_test',
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .withStartupTimeout(120_000)
    .start();

  const host = container.getHost();
  const port = container.getMappedPort(5432);

  // Bootstrap as superuser to run extensions + create app roles via the first migration.
  const bootstrap = new DataSource({
    type: 'postgres',
    host,
    port,
    username: 'postgres',
    password: 'postgres',
    database: 'gravel_test',
  });
  await bootstrap.initialize();

  // Run migrations in numeric order.
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    await bootstrap.query(sql);
  }

  // Hand ownership of all public tables to gravel_owner so that FORCE RLS
  // exercises the owner-path test.
  await bootstrap.query(`
    DO $$ DECLARE r RECORD;
    BEGIN
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
        EXECUTE format('ALTER TABLE %I OWNER TO gravel_owner', r.tablename);
      END LOOP;
    END $$;
  `);

  await bootstrap.destroy();

  const ownerDs = new DataSource({
    type: 'postgres',
    host,
    port,
    username: 'gravel_owner',
    password: 'change_me_dev',
    database: 'gravel_test',
  });
  await ownerDs.initialize();

  const appDs = new DataSource({
    type: 'postgres',
    host,
    port,
    username: 'gravel_app',
    password: 'change_me_dev',
    database: 'gravel_test',
  });
  await appDs.initialize();

  const serviceDs = new DataSource({
    type: 'postgres',
    host,
    port,
    username: 'gravel_service',
    password: 'change_me_dev',
    database: 'gravel_test',
  });
  await serviceDs.initialize();

  return { container, ownerDs, appDs, serviceDs, host, port, database: 'gravel_test' };
}

export async function stopPostgres(stack: PgTestStack): Promise<void> {
  await stack.appDs.destroy().catch(() => undefined);
  await stack.serviceDs.destroy().catch(() => undefined);
  await stack.ownerDs.destroy().catch(() => undefined);
  await stack.container.stop().catch(() => undefined);
}

// Legacy exports for Wave 0 callers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const pgContainer: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const kcContainer: any = null;
export async function startContainers(): Promise<void> {
  throw new Error('Use startPostgres() / startKeycloak() directly. Wave 0 stub retired in W1-P02.');
}
export async function stopContainers(): Promise<void> {
  /* no-op */
}
