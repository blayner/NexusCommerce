import { CallHandler, ExecutionContext } from '@nestjs/common';
import { EventEmitter } from 'events';
import { lastValueFrom, of } from 'rxjs';
import {
  HttpMetricsInterceptor,
  routeTemplate,
} from '../../../src/shared/infrastructure/metrics/http-metrics.interceptor';
import { PrometheusAppMetrics } from '../../../src/shared/infrastructure/metrics/prometheus-app-metrics';
import { histogramCount } from './metrics-test-utils';

interface FakeRequest {
  method: string;
  originalUrl: string;
  baseUrl: string;
  route?: { path: string };
}

function httpContext(request: FakeRequest, response: EventEmitter): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;
}

function fakeResponse(statusCode: number): EventEmitter & { statusCode: number } {
  return Object.assign(new EventEmitter(), { statusCode });
}

const handler: CallHandler = { handle: () => of({ ok: true }) };

describe('HttpMetricsInterceptor', () => {
  let metrics: PrometheusAppMetrics;
  let interceptor: HttpMetricsInterceptor;

  beforeEach(() => {
    metrics = new PrometheusAppMetrics();
    interceptor = new HttpMetricsInterceptor(metrics);
  });

  it('labels requests with the route template, not the raw URL', async () => {
    for (const id of ['a1', 'b2', 'c3']) {
      const response = fakeResponse(200);
      const request = {
        method: 'GET',
        originalUrl: `/api/v1/products/${id}`,
        baseUrl: '',
        route: { path: '/api/v1/products/:id' },
      };
      await lastValueFrom(interceptor.intercept(httpContext(request, response), handler));
      response.emit('finish');
    }

    const labels = { method: 'GET', route: '/api/v1/products/:id', status_code: 200 };
    expect(await histogramCount(metrics.httpRequestDuration, labels)).toBe(3);
    const exposition = await metrics.metrics();
    expect(exposition).not.toContain('/api/v1/products/a1');
  });

  it('records the final status code, after exception filters ran', async () => {
    const response = fakeResponse(200);
    const request = {
      method: 'POST',
      originalUrl: '/api/v1/products',
      baseUrl: '',
      route: { path: '/api/v1/products' },
    };
    await lastValueFrom(interceptor.intercept(httpContext(request, response), handler));
    response.statusCode = 409; // set by DomainExceptionFilter before the response finishes
    response.emit('finish');

    const conflict = { method: 'POST', route: '/api/v1/products', status_code: 409 };
    expect(await histogramCount(metrics.httpRequestDuration, conflict)).toBe(1);
  });

  it('does not record scrapes of /metrics', async () => {
    const response = fakeResponse(200);
    const request = {
      method: 'GET',
      originalUrl: '/metrics',
      baseUrl: '',
      route: { path: '/metrics' },
    };
    await lastValueFrom(interceptor.intercept(httpContext(request, response), handler));
    response.emit('finish');

    const { values } = await metrics.httpRequestDuration.get();
    expect(values).toHaveLength(0);
  });

  it('falls back to a fixed label when no route matched', () => {
    expect(routeTemplate({ baseUrl: '', route: undefined })).toBe('unmatched');
  });
});
