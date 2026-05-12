import 'reflect-metadata';
import { DataSource } from 'typeorm';

/**
 * TypeORM DataSource for CLI migrations and integration tests.
 * Runtime app uses `@nestjs/typeorm` DI wiring; both share this configuration.
 *
 * DATABASE_URL example: postgres://gravel_app:secret@localhost:5432/gravel_dev
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [__dirname + '/src/**/*.entity.{ts,js}'],
  migrations: [__dirname + '/src/migrations/*.{ts,js}'],
  synchronize: false,
  logging: process.env.TYPEORM_LOGGING === 'true',
  extra: {
    // PgBouncer transaction mode + RLS via SET LOCAL — see ARCHITECTURE.md / D-07.
    application_name: 'gravel-api',
  },
});

export default AppDataSource;
