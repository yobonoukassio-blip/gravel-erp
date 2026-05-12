import { Controller, Get, HttpCode } from '@nestjs/common';

/**
 * Kubernetes-style health probes. No business logic in Wave 0.
 *  - /health/live : process is up (liveness probe)
 *  - /health/ready: dependencies (db, keycloak, etc.) are reachable (readiness probe)
 *
 * Real dependency checks are added in W1-P02 (DB) and W1-P04 (Keycloak).
 */
@Controller('health')
export class HealthController {
  @Get('live')
  @HttpCode(200)
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @HttpCode(200)
  ready(): { status: 'ready' } {
    return { status: 'ready' };
  }
}
