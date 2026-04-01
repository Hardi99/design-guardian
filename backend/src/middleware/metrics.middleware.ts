import type { Context, Next } from 'hono';
import { incCounter, observeHistogram, incGauge, decGauge } from '../services/metrics.service.js';

export async function metricsMiddleware(c: Context, next: Next): Promise<void> {
  const start = Date.now();
  incGauge('active_connections');

  await next();

  const route  = new URL(c.req.url).pathname;
  const method = c.req.method;
  const status = String(c.res.status);

  incCounter('http_requests_total', { method, route, status });
  observeHistogram('http_request_duration_ms', Date.now() - start, { method, route });
  decGauge('active_connections');
}
