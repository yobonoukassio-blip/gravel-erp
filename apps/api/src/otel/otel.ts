/**
 * OpenTelemetry SDK bootstrap for the Gravel API (NestJS 11).
 *
 * Initialised BEFORE `NestFactory.create()` in `apps/api/src/main.ts` so the
 * auto-instrumentations can patch `http`, `pg`, `express`, `nestjs-core` and
 * `typeorm` at require-time.
 *
 * Resource attributes follow OTel semantic conventions. Span attributes
 * `tenant.id`, `site.id`, `user.id`, `request.id` are added later by the
 * `OtelContextInterceptor` from the CLS / request scope.
 *
 * NEVER add secrets, PII, raw tokens, money amounts, or full request bodies
 * to spans — only IDs and metadata.
 *
 * Exports OTLP/HTTP to `OTEL_EXPORTER_OTLP_ENDPOINT`
 * (default: http://otel-collector.observability:4318) — the Grafana LGTM
 * stack OTel Collector ingress (see `infra/helm/grafana-lgtm/values.yaml`).
 *
 * Decision references: D-37 (Grafana LGTM stack), D-38 (metric names).
 * ADR references: ADR-0001..ADR-0004 (observability is the audit-supporting
 * surface for RLS leaks, chain breaks, DST boundaries, sync conflicts).
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

let sdkInstance: NodeSDK | undefined;

function resolveEndpoint(): string {
  return (
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
    'http://otel-collector.observability:4318'
  );
}

export function startOtel(): NodeSDK {
  if (sdkInstance) {
    return sdkInstance;
  }

  const endpoint = resolveEndpoint();

  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'gravel-api',
      [SemanticResourceAttributes.SERVICE_VERSION]:
        process.env.GIT_SHA ?? 'dev',
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]:
        process.env.NODE_ENV ?? 'development',
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${endpoint}/v1/traces`,
    }),
    // Cross-package type drift between @opentelemetry/sdk-node and
    // @opentelemetry/sdk-metrics on identical MetricReader interfaces
    // (structural identity, declaration sites differ).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: `${endpoint}/v1/metrics`,
      }),
      exportIntervalMillis: 10_000,
    }) as any,
    instrumentations: [
      getNodeAutoInstrumentations({
        // `fs` instrumentation is high-volume and adds little operational value.
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();
  sdkInstance = sdk;

  // Graceful shutdown — flush traces/metrics on SIGTERM.
  const shutdown = async (): Promise<void> => {
    try {
      await sdk.shutdown();
    } catch {
      // intentional: shutdown best-effort.
    }
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  return sdk;
}

/**
 * Standard span attribute keys. Centralised so all interceptors / repositories
 * tag spans consistently and grep is reliable.
 *
 * NEVER add money amounts, tokens, full request bodies, or PII here.
 */
export const SpanAttr = {
  TENANT_ID: 'tenant.id',
  SITE_ID: 'site.id',
  USER_ID: 'user.id',
  REQUEST_ID: 'request.id',
} as const;
