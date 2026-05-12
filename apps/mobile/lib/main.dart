import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';
import 'core/otel/otel.dart';

void main() {
  runApp(const ProviderScope(child: GravelApp()));
  // Start OTel AFTER runApp — first paint is not blocked. The SDK exports
  // OTLP/HTTP to the Grafana LGTM collector configured via --dart-define.
  startMobileOtel(
    otelEndpoint: const String.fromEnvironment(
      'OTEL_ENDPOINT',
      defaultValue: 'http://otel-collector.observability:4318',
    ),
    serviceVersion: const String.fromEnvironment(
      'GIT_SHA',
      defaultValue: 'dev',
    ),
    environment: const String.fromEnvironment(
      'APP_ENV',
      defaultValue: 'development',
    ),
  );
}
