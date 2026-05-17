import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import {
  syncAttemptsCounter,
  bullmqJobDurationHistogram,
  alertDispatchLatencyHistogram,
} from './slo-metrics.providers';

/**
 * SloMetricsModule (HRD-MVP-06).
 *
 * Registers the three custom Prometheus metrics that back SLO-B, SLO-C, SLO-D
 * (sync success, BullMQ queue drain, alert dispatch latency). The fourth SLO
 * (API latency) is served by built-in OpenTelemetry HTTP auto-instrumentation
 * and does not require a provider here.
 *
 * Imported once in AppModule. Re-imported by any feature module that needs to
 * @InjectMetric one of these (SyncModule, NotificationModule).
 */
@Module({
  imports: [PrometheusModule],
  providers: [
    syncAttemptsCounter,
    bullmqJobDurationHistogram,
    alertDispatchLatencyHistogram,
  ],
  exports: [
    syncAttemptsCounter,
    bullmqJobDurationHistogram,
    alertDispatchLatencyHistogram,
  ],
})
export class SloMetricsModule {}
