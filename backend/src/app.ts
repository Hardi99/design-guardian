import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { getSupabaseClient } from './config/supabase.js';
import { getEnv } from './config/env.js';
import { authRouter } from './controllers/auth.controller.js';
import { projectsRouter } from './controllers/projects.controller.js';
import { assetsRouter } from './controllers/assets.controller.js';
import { checkpointsRouter } from './controllers/checkpoints.controller.js';
import { branchesRouter } from './controllers/branches.controller.js';
import { notificationsRouter } from './controllers/notifications.controller.js';
import { paymentsRouter } from './controllers/payments.controller.js';
import { metricsMiddleware } from './middleware/metrics.middleware.js';
import { registry } from './services/metrics.service.js';
import { getOpenApiSpec } from './services/openapi.js';

const startTime = Date.now();

export function createApp() {
  const app = new Hono();

  // CORS — restreint aux origines de CORS_ORIGINS si défini ; sinon toutes (défaut non-bloquant).
  // Note : le plugin Figma émet depuis une origine `null`, d'où le défaut permissif tant qu'une
  // allowlist explicite n'est pas configurée en prod.
  const corsOrigins = getEnv().CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);

  app.use('*', logger());
  app.use('*', cors({ origin: corsOrigins.length > 0 ? corsOrigins : '*' }));
  app.use('*', metricsMiddleware);

  app.get('/', (c) =>
    c.json({ name: 'Design Guardian API', version: '1.0.0', status: 'running' }),
  );

  // Health check (no auth — used by Railway uptime checks)
  app.get('/health', (c) => c.json({
    status: 'ok',
    version: '1.0.0',
    uptime_ms: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  }));

  // DB ping — keeps Supabase free tier from pausing (hit by UptimeRobot every 5min)
  app.get('/ping', async (c) => {
    const { error } = await getSupabaseClient().from('projects').select('id').limit(1);
    if (error) return c.json({ status: 'db_error', error: error.message }, 503);
    return c.json({ status: 'ok' });
  });

  // Prometheus metrics — protégé par METRICS_TOKEN si défini (sinon ouvert, défaut non-bloquant).
  app.get('/metrics', async (c) => {
    const token = getEnv().METRICS_TOKEN;
    if (token) {
      const provided = c.req.header('Authorization')?.replace('Bearer ', '') ?? c.req.query('token');
      if (provided !== token) return c.json({ error: 'Unauthorized' }, 401);
    }
    c.header('Content-Type', registry.contentType);
    return c.text(await registry.metrics());
  });

  // OpenAPI spec + Swagger UI (BC02 — technical documentation)
  app.get('/api/openapi.json', (c) => c.json(getOpenApiSpec()));
  app.get('/api/docs', (c) => c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Design Guardian — API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <style>body{margin:0}.swagger-ui .topbar{background:#18181b}</style>
</head>
<body>
<div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>
  SwaggerUIBundle({
    url: '/api/openapi.json',
    dom_id: '#swagger-ui',
    deepLinking: true,
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
    layout: 'BaseLayout',
    tryItOutEnabled: true,
  });
</script>
</body>
</html>`));

  app.route('/api/auth', authRouter);
  app.route('/api/projects', projectsRouter);
  app.route('/api/assets', assetsRouter);
  app.route('/api/checkpoints', checkpointsRouter);
  app.route('/api/branches', branchesRouter);
  app.route('/api/notifications', notificationsRouter);
  app.route('/api/payments', paymentsRouter);

  return app;
}

