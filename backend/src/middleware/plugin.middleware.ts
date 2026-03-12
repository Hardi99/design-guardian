import type { Context, Next } from 'hono';
import { getSupabaseClient } from '../config/supabase.js';
import type { ProjectEnv } from '../types/hono.js';

/**
 * Plugin middleware — validates the X-API-Key header against projects.api_key.
 * Sets projectId in context for downstream handlers.
 * Used by all plugin-facing routes (assets, checkpoints, branches).
 */
export async function pluginMiddleware(c: Context<ProjectEnv>, next: Next): Promise<Response | void> {
  const key = c.req.header('X-API-Key');
  if (!key) return c.json({ error: 'Missing X-API-Key header' }, 401);

  const { data } = await getSupabaseClient()
    .from('projects')
    .select('id')
    .eq('api_key', key)
    .maybeSingle();

  if (!data) return c.json({ error: 'Invalid API key' }, 401);

  c.set('projectId', data.id);
  await next();
}
