import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { projectsRouter } from './controllers/projects.controller.js';
import { assetsRouter } from './controllers/assets.controller.js';
import { versionsRouter } from './controllers/versions.controller.js';
import { fontsRouter } from './controllers/fonts.controller.js';

export function createApp() {
  const app = new Hono();

  app.use('*', logger());
  app.use('*', cors());

  app.get('/', (c) =>
    c.json({ name: 'Design Guardian API', version: '1.0.0', status: 'running' })
  );

  app.route('/api/projects', projectsRouter);
  app.route('/api/assets', assetsRouter);
  app.route('/api/versions', versionsRouter);
  app.route('/api/fonts', fontsRouter);

  return app;
}
