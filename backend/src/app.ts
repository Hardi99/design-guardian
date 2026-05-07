import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authRouter } from './controllers/auth.controller.js';
import { projectsRouter } from './controllers/projects.controller.js';
import { assetsRouter } from './controllers/assets.controller.js';
import { checkpointsRouter } from './controllers/checkpoints.controller.js';
import { branchesRouter } from './controllers/branches.controller.js';
import { metricsMiddleware } from './middleware/metrics.middleware.js';
import { registry } from './services/metrics.service.js';

const startTime = Date.now();

export function createApp() {
  const app = new Hono();

  app.use('*', logger());
  app.use('*', cors());
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

  // Prometheus metrics (no auth — scraped by Prometheus server)
  app.get('/metrics', async (c) => {
    c.header('Content-Type', registry.contentType);
    return c.text(await registry.metrics());
  });

  app.route('/api/auth', authRouter);
  app.route('/api/projects', projectsRouter);
  app.route('/api/assets', assetsRouter);
  app.route('/api/checkpoints', checkpointsRouter);
  app.route('/api/branches', branchesRouter);

  return app;
}

