import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { PrometheusAppMetrics } from './prometheus-app-metrics';

export const METRICS_PATH = '/metrics';
const UNMATCHED_ROUTE = 'unmatched';

/**
 * Records `nexus_http_request_duration_seconds` for every HTTP request.
 *
 * - The `route` label is the **route template** (`/api/v1/products/:id`), never the raw
 *   URL, so the number of time series stays bounded no matter how many ids are requested.
 * - The status code is read when the response finishes, i.e. after exception filters
 *   have mapped domain errors to HTTP statuses (a 409 is recorded as 409, not 500).
 * - Scrapes of `/metrics` itself are not recorded.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: PrometheusAppMetrics) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const route = routeTemplate(request);
    if (route === METRICS_PATH) return next.handle();

    const startedAt = process.hrtime.bigint();
    response.once('finish', () => {
      const seconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
      this.metrics.observeHttpRequest(request.method, route, response.statusCode, seconds);
    });

    return next.handle();
  }
}

/** Express exposes the matched route definition on `req.route`; Nest registers full paths. */
export function routeTemplate(request: Pick<Request, 'route' | 'baseUrl'>): string {
  const path: unknown = (request.route as { path?: unknown } | undefined)?.path;
  if (typeof path !== 'string') return UNMATCHED_ROUTE;
  return `${request.baseUrl ?? ''}${path}` || '/';
}
