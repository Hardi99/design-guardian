import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { loadEnv, getEnv } from './config/env.js';
import { projectsRouter } from './controllers/projects.controller.js';
import { assetsRouter } from './controllers/assets.controller.js';
import { versionsRouter } from './controllers/versions.controller.js';
import { fontsRouter } from './controllers/fonts.controller.js';

// Load environment variables
try {
  loadEnv();
  console.log('✅ Environment variables loaded');
} catch (error) {
  console.error('❌ Failed to load environment variables');
  process.exit(1);
}

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors());

// Health check route
app.get('/', (c) => {
  return c.json({
    name: 'Design Guardian API',
    version: '1.0.0',
    status: 'running',
    environment: getEnv().NODE_ENV
  });
});

// API Routes
app.route('/api/projects', projectsRouter);
app.route('/api/assets', assetsRouter);
app.route('/api/versions', versionsRouter);
app.route('/api/fonts', fontsRouter);

const env = getEnv();
const port = Number(env.PORT);

console.log(`🚀 Design Guardian API running on http://localhost:${port}`);
console.log(`📦 Environment: ${env.NODE_ENV}`);

serve({
  fetch: app.fetch,
  port
});
