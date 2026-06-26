import type { Context, Next } from 'hono';
import { getSupabaseClient } from '../config/supabase.js';
import { hashToken } from '../services/link.service.js';
import type { ProjectEnv } from '../types/hono.js';

/**
 * Plugin middleware — valide X-API-Key contre projects.api_key et pose projectId/plan.
 * Plan effectif : si X-Link-Token valide → plan du compte lié (override) ; sinon plan projet.
 */
export async function pluginMiddleware(c: Context<ProjectEnv>, next: Next): Promise<Response | void> {
  const key = c.req.header('X-API-Key');
  if (!key) return c.json({ error: 'Missing X-API-Key header' }, 401);

  const db = getSupabaseClient();
  const { data } = await db.from('projects').select('id, plan').eq('api_key', key).maybeSingle();
  if (!data) return c.json({ error: 'Invalid API key' }, 401);

  c.set('projectId', data.id);

  let plan = (data.plan ?? 'free') as string;
  const linkToken = c.req.header('X-Link-Token');
  if (linkToken) {
    const { data: link } = await db
      .from('device_links').select('profile_id').eq('token_hash', hashToken(linkToken)).not('profile_id', 'is', null).maybeSingle();
    if (link?.profile_id) {
      const { data: profile } = await db.from('profiles').select('plan').eq('id', link.profile_id).maybeSingle();
      if (profile?.plan) plan = profile.plan as string;
    }
  }
  c.set('plan', plan);
  await next();
}
