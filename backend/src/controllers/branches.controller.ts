import { Hono } from 'hono';
import { getSupabaseClient } from '../config/supabase.js';
import { pluginMiddleware } from '../middleware/plugin.middleware.js';
import type { VersionTreeResponse, ApproveVersionResponse, ErrorResponse } from '../types/api.js';
import type { Version } from '../types/database.js';
import type { ProjectEnv } from '../types/hono.js';

const branchesRouter = new Hono<ProjectEnv>();

/**
 * GET /api/branches/tree?asset_id=...
 * Returns all versions for an asset, flat list sorted by created_at.
 */
branchesRouter.get('/tree', pluginMiddleware, async (c) => {
  const { asset_id } = c.req.query();
  if (!asset_id) return c.json<ErrorResponse>({ error: 'asset_id required' }, 400);

  const supabase = getSupabaseClient();

  // Verify asset belongs to this project
  const { data: asset } = await supabase
    .from('assets').select('id').eq('id', asset_id).eq('project_id', c.get('projectId')).single();
  if (!asset) return c.json<ErrorResponse>({ error: 'Asset not found' }, 404);

  const { data, error } = await supabase
    .from('versions')
    .select('id, version_number, branch_name, status, ai_summary, author_name, author_figma_id, author_avatar_url, created_at, parent_id, asset_id, figma_node_id, approved_at, approved_by')
    .eq('asset_id', asset_id)
    .order('created_at', { ascending: true });

  if (error) return c.json<ErrorResponse>({ error: 'Failed to fetch versions', details: error.message }, 500);

  const versions = (data ?? []) as Version[];
  const branches = [...new Set(versions.map(v => v.branch_name))].sort();
  if (!branches.includes('main')) branches.unshift('main');

  return c.json<VersionTreeResponse>({ versions, branches });
});

/**
 * GET /api/branches/versions/:id
 * Returns a single version with snapshot + analysis + signed SVG URLs (current + parent)
 */
branchesRouter.get('/versions/:id', pluginMiddleware, async (c) => {
  const supabase = getSupabaseClient();

  const { data: version, error } = await supabase
    .from('versions')
    .select('*, assets!inner(project_id)')
    .eq('id', c.req.param('id'))
    .single();

  if (error || !version) return c.json<ErrorResponse>({ error: 'Version not found' }, 404);
  if ((version.assets as { project_id: string }).project_id !== c.get('projectId'))
    return c.json<ErrorResponse>({ error: 'Forbidden' }, 403);

  const { assets: _assets, ...versionData } = version;

  // Signed SVG URLs (1h expiry)
  const signedUrl = async (path: string | null) => {
    if (!path) return null;
    const { data } = await supabase.storage.from('design-guardian').createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  };

  let prevVersion = null;
  if (versionData.parent_id) {
    const { data: prev } = await supabase
      .from('versions')
      .select('id, version_number, branch_name, status, author_name, created_at, storage_path, analysis_json, snapshot_json')
      .eq('id', versionData.parent_id)
      .single();
    prevVersion = prev;
  }

  const [svgUrl, prevSvgUrl] = await Promise.all([
    signedUrl(versionData.storage_path),
    signedUrl(prevVersion?.storage_path ?? null),
  ]);

  return c.json({ version: versionData, prev_version: prevVersion, svg_url: svgUrl, prev_svg_url: prevSvgUrl });
});

/**
 * PUT /api/branches/versions/:id/status
 * Update version status: draft | review | approved
 */
branchesRouter.put('/versions/:id/status', pluginMiddleware, async (c) => {
  const { status } = await c.req.json<{ status: Version['status'] }>();
  if (!['draft', 'review', 'approved'].includes(status)) {
    return c.json<ErrorResponse>({ error: 'Invalid status' }, 400);
  }

  const update: Partial<Version> = {
    status,
    approved_by: status === 'approved' ? c.get('projectId') : null,
    approved_at: status === 'approved' ? new Date().toISOString() : null,
  };

  const { data, error } = await getSupabaseClient()
    .from('versions')
    .update(update)
    .eq('id', c.req.param('id'))
    .select()
    .single();

  if (error || !data) return c.json<ErrorResponse>({ error: 'Version not found', details: error?.message }, 404);
  return c.json<ApproveVersionResponse>({ version: data });
});

export { branchesRouter };
