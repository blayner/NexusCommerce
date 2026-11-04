import { Global, Module } from '@nestjs/common';
import { AppMetrics } from '../../application/app-metrics.port';
import { MetricsController } from './metrics.controller';
import { OrderMetricsSubscriber } from './order-metrics.subscriber';
import { PrometheusAppMetrics } from './prometheus-app-metrics';

/**
 * Global so any module can inject the `AppMetrics` port without importing this module.
 * The HTTP interceptor is registered in AppModule next to the logging interceptor.
 */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    {
      provide: PrometheusAppMetrics,
      useFactory: () => new PrometheusAppMetrics({ collectDefaults: true }),
    },
    { provide: AppMetrics, useExisting: PrometheusAppMetrics },
    OrderMetricsSubscriber,
  ],
  exports: [AppMetrics, PrometheusAppMetrics],
})
export class MetricsModule {}
