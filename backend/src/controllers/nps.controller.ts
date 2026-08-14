import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getSupabaseClient } from '../config/supabase.js';
import { pluginMiddleware } from '../middleware/plugin.middleware.js';
import { npsSchema } from '../types/api.js';
import type { ErrorResponse } from '../types/api.js';
import type { ProjectEnv } from '../types/hono.js';
import { recordNps } from '../services/nps.service.js';

const npsRouter = new Hono<ProjectEnv>();

// POST /api/nps — enregistre une réponse NPS (prompt in-plugin). Auth X-API-Key.
npsRouter.post('/', pluginMiddleware, zValidator('json', npsSchema), async (c) => {
  const { error } = await recordNps(getSupabaseClient(), c.get('projectId'), c.req.valid('json'));
  if (error) return c.json<ErrorResponse>({ error: 'Failed to record NPS', details: error }, 500);
  return c.json({ ok: true }, 201);
});

export { npsRouter };
