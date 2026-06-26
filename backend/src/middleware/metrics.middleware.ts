import type { Context, Next } from 'hono';
import { routePath } from 'hono/route';
import { httpRequestsTotal, httpRequestDuration, activeConnections } from '../services/metrics.service.js';

export async function metricsMiddleware(c: Context, next: Next): Promise<void> {
  const start = Date.now();
  activeConnections.inc();
  try {
    await next();
  } finally {
    // Pattern de route Hono (leaf match, ex. `/api/checkpoints/:id`) plutôt que le pathname
    // concret → évite l'explosion de cardinalité Prometheus (1 série par id). `routePath(c, -1)`
    // = dernière route matchée (le handler), pas `*` du middleware global. API non-dépréciée.
    const route = routePath(c, -1);
    const method = c.req.method;
    const status = String(c.res.status);
    httpRequestsTotal.inc({ method, route, status });
    httpRequestDuration.observe({ method, route }, Date.now() - start);
    activeConnections.dec();
  }
}
