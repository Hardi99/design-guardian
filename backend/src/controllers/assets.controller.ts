import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getSupabaseClient } from '../config/supabase.js';
import { createAssetSchema } from '../types/api.js';
import type { AssetResponse, AssetsListResponse, ErrorResponse } from '../types/api.js';

const assetsRouter = new Hono();

/**
 * GET /api/assets
 * List all assets for a project
 */
assetsRouter.get('/', async (c) => {
  try {
    const supabase = getSupabaseClient();
    const { project_id } = c.req.query();

    if (!project_id) {
      return c.json<ErrorResponse>({ error: 'project_id query parameter required' }, 400);
    }

    const { data, error } = await supabase
      .from('assets')
      .select('*')
      .eq('project_id', project_id)
      .order('created_at', { ascending: false });

    if (error) {
      return c.json<ErrorResponse>({ error: 'Failed to fetch assets', details: error.message }, 500);
    }

    return c.json<AssetsListResponse>({ assets: data });
  } catch (error) {
    return c.json<ErrorResponse>({ error: 'Internal server error' }, 500);
  }
});

/**
 * GET /api/assets/:id
 * Get a specific asset
 */
assetsRouter.get('/:id', async (c) => {
  try {
    const supabase = getSupabaseClient();
    const { id } = c.req.param();

    const { data, error } = await supabase
      .from('assets')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return c.json<ErrorResponse>({ error: 'Asset not found' }, 404);
    }

    return c.json<AssetResponse>({ asset: data });
  } catch (error) {
    return c.json<ErrorResponse>({ error: 'Internal server error' }, 500);
  }
});

/**
 * POST /api/assets
 * Create a new asset
 */
assetsRouter.post('/', zValidator('json', createAssetSchema), async (c) => {
  try {
    const supabase = getSupabaseClient();
    const body = c.req.valid('json');

    const { data, error } = await supabase
      .from('assets')
      .insert({
        project_id: body.project_id,
        name: body.name
      })
      .select()
      .single();

    if (error || !data) {
      return c.json<ErrorResponse>({ error: 'Failed to create asset', details: error?.message }, 500);
    }

    return c.json<AssetResponse>({ asset: data }, 201);
  } catch (error) {
    return c.json<ErrorResponse>({ error: 'Internal server error' }, 500);
  }
});

/**
 * DELETE /api/assets/:id
 * Delete an asset
 */
assetsRouter.delete('/:id', async (c) => {
  try {
    const supabase = getSupabaseClient();
    const { id } = c.req.param();

    const { error } = await supabase
      .from('assets')
      .delete()
      .eq('id', id);

    if (error) {
      return c.json<ErrorResponse>({ error: 'Failed to delete asset', details: error.message }, 500);
    }

    return c.json({ message: 'Asset deleted successfully' });
  } catch (error) {
    return c.json<ErrorResponse>({ error: 'Internal server error' }, 500);
  }
});

export { assetsRouter };
