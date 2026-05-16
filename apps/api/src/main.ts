// Force IPv4 DNS resolution globally — Railway US West resolves Supabase hostnames
// to IPv6 addresses which are unreachable. Must run before any network call.
// Deploy: 2026-05-13 — TYPEORM_SYNCHRONIZE=true activé sur Railway
import { setDefaultResultOrder } from 'node:dns';
setDefaultResultOrder('ipv4first');

// JSON.stringify cannot serialize BigInt natively, which makes any endpoint
// returning a bigint (tonnage_*_kg in dashboard payloads, money minor units)
// crash with `TypeError: Do not know how to serialize a BigInt`. Emit BigInt
// as a string in JSON responses — callers already treat XOF amounts as strings.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

// IMPORTANT: OTel must be started BEFORE any module that should be instrumented
// is imported. Keep this import at the very top of the file.
import { startOtel } from './otel/otel';
if (process.env['OTEL_SDK_DISABLED'] !== 'true') {
  startOtel();
}

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
// CamelCaseInterceptor désactivé — frontend mixte snake/camel difficile à unifier
// sans casser le build. Endpoints raw servent du camelCase via aliases SQL.
// Pour réactiver: dé-commenter l'import + l'appel useGlobalInterceptors ci-dessous.
// import { CamelCaseInterceptor } from './common/interceptors/camel-case.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // app.useGlobalInterceptors(new CamelCaseInterceptor());
  app.setGlobalPrefix('api', { exclude: ['/health/live', '/health/ready', '/health/metrics'] });
  app.enableShutdownHooks();
  app.enableCors({
    origin: ['http://localhost:4200', ...(process.env['CORS_ORIGINS']?.split(',') ?? [])],
    credentials: true,
  });

  const port = Number.parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);
  Logger.log(`Gravel API listening on :${port}`, 'Bootstrap');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to bootstrap Gravel API:', err);
  process.exit(1);
});

