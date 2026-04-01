import type { Context, Next } from 'hono';
import { httpRequestsTotal, httpRequestDuration, activeConnections } from '../services/metrics.service.js';

export async function metricsMiddleware(c: Context, next: Next): Promise<void> {
  const start = Date.now();
  activeConnections.inc();

  await next();

  const route  = new URL(c.req.url).pathname;
  const method = c.req.method;
  const status = String(c.res.status);

  httpRequestsTotal.inc({ method, route, status });
  httpRequestDuration.observe({ method, route }, Date.now() - start);
  activeConnections.dec();
}
