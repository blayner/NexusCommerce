import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../../auth/decorators';
import { PrometheusAppMetrics } from './prometheus-app-metrics';

/**
 * Prometheus scrape endpoint, served at `/metrics` (outside the `/api/v1` prefix, like the
 * health checks). It is public at the application level; in production it should only be
 * reachable from the internal network or the scraper (see ADR 0007).
 */
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: PrometheusAppMetrics) {}

  @Public()
  @Get()
  async scrape(@Res({ passthrough: true }) res: Response): Promise<string> {
    res.setHeader('Content-Type', this.metrics.contentType);
    return this.metrics.metrics();
  }
}
