/// OpenTelemetry bootstrap for the Gravel mobile app (Flutter 3.35).
///
/// Initialised in `main.dart` AFTER `runApp` (so the SDK init does not block
/// first paint — D-37 latency budget). Exports OTLP/HTTP to the Grafana LGTM
/// collector and propagates W3C `traceparent` on outbound Dio requests.
///
/// Standard attributes (kept consistent with API + Web):
///  - tenant.id  — from the JWT claim once the user signs in
///  - site.id    — from the active site selector
///  - user.id    — Keycloak `sub`
///  - request.id — generated per Dio request
///
/// NEVER add tokens, money amounts, or full request bodies to spans.
library;

import 'package:dio/dio.dart';
import 'package:opentelemetry/api.dart' as otel_api;
import 'package:opentelemetry/sdk.dart' as otel_sdk;

/// Standard span attribute keys — keep in sync with
/// `apps/api/src/otel/otel.ts#SpanAttr` and the web equivalent.
class SpanAttr {
  static const tenantId = 'tenant.id';
  static const siteId = 'site.id';
  static const userId = 'user.id';
  static const requestId = 'request.id';
}

otel_api.Tracer? _tracer;
otel_sdk.TracerProviderBase? _provider;

/// Initialise the OTel SDK once. Safe to call multiple times.
void startMobileOtel({
  String otelEndpoint = 'http://otel-collector.observability:4318',
  String serviceVersion = 'dev',
  String environment = 'development',
}) {
  if (_tracer != null) return;

  final exporter = otel_sdk.CollectorExporter(
    Uri.parse('$otelEndpoint/v1/traces'),
  );

  final processor = otel_sdk.BatchSpanProcessor(exporter);

  _provider = otel_sdk.TracerProviderBase(
    processors: [processor],
    resource: otel_sdk.Resource([
      otel_api.Attribute.fromString('service.name', 'gravel-mobile'),
      otel_api.Attribute.fromString('service.version', serviceVersion),
      otel_api.Attribute.fromString('deployment.environment', environment),
    ]),
  );

  otel_api.registerGlobalTracerProvider(_provider!);
  _tracer = _provider!.getTracer('gravel-mobile');
}

/// Dio interceptor that:
///  1. Starts a CLIENT span around every HTTP request.
///  2. Injects W3C `traceparent` header so the API can stitch the trace.
///  3. Tags the span with tenant.id / site.id / user.id from the provided
///     [contextProvider] (typically reads from Riverpod auth state).
///
/// Must be added BEFORE auth interceptors so the span covers the full
/// token-refresh-and-retry duration.
class OtelDioInterceptor extends Interceptor {
  OtelDioInterceptor({required this.contextProvider});

  /// Returns the current tenant context, or `null` before sign-in.
  final Map<String, String>? Function() contextProvider;

  static const _spanKey = '__otel_span';

  @override
  void onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) {
    final tracer = _tracer;
    if (tracer == null) {
      handler.next(options);
      return;
    }

    final span = tracer.startSpan(
      '${options.method} ${options.uri.path}',
      kind: otel_api.SpanKind.client,
    );

    span.setAttribute(
      otel_api.Attribute.fromString('http.method', options.method),
    );
    span.setAttribute(
      otel_api.Attribute.fromString('http.url', options.uri.toString()),
    );

    final ctx = contextProvider();
    if (ctx != null) {
      final tenantId = ctx['tenantId'];
      final siteId = ctx['siteId'];
      final userId = ctx['userId'];
      final requestId = ctx['requestId'];
      if (tenantId != null) {
        span.setAttribute(otel_api.Attribute.fromString(SpanAttr.tenantId, tenantId));
      }
      if (siteId != null) {
        span.setAttribute(otel_api.Attribute.fromString(SpanAttr.siteId, siteId));
      }
      if (userId != null) {
        span.setAttribute(otel_api.Attribute.fromString(SpanAttr.userId, userId));
      }
      if (requestId != null) {
        span.setAttribute(otel_api.Attribute.fromString(SpanAttr.requestId, requestId));
        options.headers['x-request-id'] = requestId;
      }
    }

    // Inject W3C traceparent header so the API picks up the parent span.
    final carrier = <String, String>{};
    otel_api.globalTextMapPropagator.inject(
      otel_api.Context.current.withSpan(span),
      carrier,
      _MapSetter(),
    );
    options.headers.addAll(carrier);
    options.extra[_spanKey] = span;

    handler.next(options);
  }

  @override
  void onResponse(
    Response<dynamic> response,
    ResponseInterceptorHandler handler,
  ) {
    final span = response.requestOptions.extra[_spanKey] as otel_api.Span?;
    if (span != null) {
      span.setAttribute(
        otel_api.Attribute.fromInt('http.status_code', response.statusCode ?? 0),
      );
      span.end();
    }
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final span = err.requestOptions.extra[_spanKey] as otel_api.Span?;
    if (span != null) {
      span.setStatus(otel_api.StatusCode.error, err.message ?? 'request failed');
      if (err.response?.statusCode != null) {
        span.setAttribute(
          otel_api.Attribute.fromInt('http.status_code', err.response!.statusCode!),
        );
      }
      span.end();
    }
    handler.next(err);
  }
}

class _MapSetter implements otel_api.TextMapSetter<Map<String, String>> {
  @override
  void set(Map<String, String>? carrier, String key, String value) {
    if (carrier != null) carrier[key] = value;
  }
}
