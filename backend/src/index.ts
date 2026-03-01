/**
 * Node.js entry point (local development)
 */
import { serve } from '@hono/node-server';
import { loadEnv, getEnv } from './config/env.js';
import { createApp } from './app.js';

try {
  loadEnv();
  console.log('✅ Environment variables loaded');
} catch (error) {
  console.error('❌ Failed to load environment variables');
  process.exit(1);
}

const app = createApp();
const env = getEnv();
const port = Number(env.PORT);

console.log(`🚀 Design Guardian API running on http://localhost:${port}`);
console.log(`📦 Environment: ${env.NODE_ENV}`);

serve({ fetch: app.fetch, port });
