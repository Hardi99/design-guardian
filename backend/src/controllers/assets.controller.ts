import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getSupabaseClient } from '../config/supabase.js';
import { pluginMiddleware } from '../middleware/plugin.middleware.js';
import { createAssetSchema } from '../types/api.js';
import type { AssetResponse, AssetsListResponse, ErrorResponse } from '../types/api.js';
import type { ProjectEnv } from '../types/hono.js';

const assetsRouter = new Hono<ProjectEnv>();

assetsRouter.get('/', pluginMiddleware, async (c) => {
  const { data, error } = await getSupabaseClient()
    .from('assets')
    .select('*')
    .eq('project_id', c.get('projectId'))
    .order('created_at', { ascending: false });

  if (error) return c.json<ErrorResponse>({ error: 'Failed to fetch assets', details: error.message }, 500);
  return c.json<AssetsListResponse>({ assets: data });
});

assetsRouter.get('/:id', pluginMiddleware, async (c) => {
  const { data, error } = await getSupabaseClient()
    .from('assets')
    .select('*')
    .eq('id', c.req.param('id'))
    .eq('project_id', c.get('projectId'))
    .single();

  if (error || !data) return c.json<ErrorResponse>({ error: 'Asset not found' }, 404);
  return c.json<AssetResponse>({ asset: data });
});

assetsRouter.post('/', pluginMiddleware, zValidator('json', createAssetSchema), async (c) => {
  const body = c.req.valid('json');
  const { data, error } = await getSupabaseClient()
    .from('assets')
    .insert({ ...body, project_id: c.get('projectId'), description: body.description ?? null })
    .select()
    .single();

  if (error || !data) return c.json<ErrorResponse>({ error: 'Failed to create asset', details: error?.message }, 500);
  return c.json<AssetResponse>({ asset: data }, 201);
});

assetsRouter.delete('/:id', pluginMiddleware, async (c) => {
  const { error } = await getSupabaseClient()
    .from('assets')
    .delete()
    .eq('id', c.req.param('id'))
    .eq('project_id', c.get('projectId'));

  if (error) return c.json<ErrorResponse>({ error: 'Failed to delete asset', details: error.message }, 500);
  return c.json<{ message: string }>({ message: 'Asset deleted' });
});

export { assetsRouter };
