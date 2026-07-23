import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Structured access log with request correlation. Propagates an incoming `x-request-id`
 * (or generates one) and echoes it in the response for cross-service tracing.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const incoming = request.headers[REQUEST_ID_HEADER];
    const requestId = (Array.isArray(incoming) ? incoming[0] : incoming) ?? randomUUID();
    response.setHeader(REQUEST_ID_HEADER, requestId);

    const startedAt = process.hrtime.bigint();
    const log = (statusCode: number) => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      this.logger.log(
        JSON.stringify({
          requestId,
          method: request.method,
          path: request.originalUrl,
          statusCode,
          durationMs: Math.round(durationMs * 100) / 100,
        }),
      );
    };

    return next.handle().pipe(
      tap({
        next: () => log(response.statusCode),
        error: (error: { status?: number }) => log(error?.status ?? 500),
      }),
    );
  }
}
