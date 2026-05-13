/**
 * Browser OpenTelemetry bootstrap for the Gravel Web app (Angular 20).
 *
 * Initialised in `app.config.ts` BEFORE `bootstrapApplication()` so the
 * fetch + document-load instrumentations capture the cold-start.
 *
 * Exports OTLP/HTTP to the Grafana LGTM OTel Collector. The endpoint is
 * configured via `environment.otelEndpoint`; the deployment writes a
 * runtime config to `/assets/runtime-config.json` (see ADR-0001 §Deployment).
 *
 * Trace propagation: W3C `traceparent` header is attached automatically to
 * `fetch()` requests targeted at the API origin, so api ↔ web spans link
 * up in Tempo.
 */
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { W3CTraceContextPropagator } from '@opentelemetry/core';

import { environment } from '../../../environments/environment';

let started = false;

export function startWebOtel(): void {
  if (started) return;
  started = true;

  const endpoint =
    environment.otelEndpoint || 'http://otel-collector.observability:4318';

  // Skip OTel if endpoint is still the placeholder (relative URL would crash).
  if (!endpoint.startsWith('http')) return;

  const provider = new WebTracerProvider({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'gravel-web',
      [SemanticResourceAttributes.SERVICE_VERSION]: environment.version ?? 'dev',
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]:
        environment.name ?? 'development',
    }),
  });

  provider.addSpanProcessor(
    new BatchSpanProcessor(
      new OTLPTraceExporter({
        url: `${endpoint}/v1/traces`,
      }),
    ),
  );

  provider.register({
    contextManager: new ZoneContextManager(),
    propagator: new W3CTraceContextPropagator(),
  });

  registerInstrumentations({
    instrumentations: [
      new FetchInstrumentation({
        propagateTraceHeaderCorsUrls: [
          // Propagate traceparent to same-origin and to the configured API.
          new RegExp(`^${environment.apiUrl ?? ''}.*`),
          /\/api\/.*/,
        ],
        clearTimingResources: true,
      }),
      new DocumentLoadInstrumentation(),
    ],
  });
}
