import { Hono } from 'hono';
import { pluginMiddleware } from '../middleware/plugin.middleware.js';
import { getSupabaseClient } from '../config/supabase.js';
import type { ProjectEnv } from '../types/hono.js';
import type { ErrorResponse } from '../types/api.js';

const authRouter = new Hono<ProjectEnv>();

/**
 * GET /api/auth/verify
 * Validates the X-API-Key and returns the associated project info + plan.
 * Called by the plugin setup screen to confirm the key is valid.
 */
authRouter.get('/verify', pluginMiddleware, async (c) => {
  const { data, error } = await getSupabaseClient()
    .from('projects')
    .select('id, name, plan')
    .eq('id', c.get('projectId'))
    .single();

  if (error || !data) return c.json<ErrorResponse>({ error: 'Project not found' }, 404);

  return c.json({ project: data });
});

export { authRouter };
