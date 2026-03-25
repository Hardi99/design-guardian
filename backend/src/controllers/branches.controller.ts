import { Hono } from 'hono';
import { getSupabaseClient } from '../config/supabase.js';
import { pluginMiddleware } from '../middleware/plugin.middleware.js';
import { generateSvgFromSnapshot, generateSvgFromNode, findNodeById } from '../services/svg-generator.service.js';
import type { VersionTreeResponse, ApproveVersionResponse, ErrorResponse } from '../types/api.js';
import type { Version } from '../types/database.js';
import type { ProjectEnv } from '../types/hono.js';
import type { FigmaSnapshot } from '../types/figma.js';

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
 * Returns a single version with snapshot + analysis + inline SVGs (full frame + per-node diffs)
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

  const toFullSvgB64 = (snapshot: unknown): string | null => {
    try {
      return Buffer.from(generateSvgFromSnapshot(snapshot as FigmaSnapshot)).toString('base64');
    } catch { return null; }
  };

  const toNodeSvgB64 = (snapshot: FigmaSnapshot, nodeId: string): string | null => {
    try {
      const node = findNodeById(snapshot.root, nodeId);
      if (!node) return null;
      return Buffer.from(generateSvgFromNode(node)).toString('base64');
    } catch { return null; }
  };

  let prevVersion = null;
  if (versionData.parent_id) {
    const { data: prev } = await supabase
      .from('versions')
      .select('id, version_number, branch_name, status, author_name, created_at, analysis_json, snapshot_json')
      .eq('id', versionData.parent_id)
      .single();
    prevVersion = prev;
  }

  const svgB64     = toFullSvgB64(versionData.snapshot_json);
  const prevSvgB64 = prevVersion ? toFullSvgB64(prevVersion.snapshot_json) : null;

  // Build per-node mini SVGs for the node-diff view
  const delta = versionData.analysis_json as { modified: Array<{ nodeId: string; nodeName: string; nodeType: string; changes: unknown[] }>; added: Array<{ nodeId: string; nodeName: string; nodeType: string }>; removed: Array<{ nodeId: string; nodeName: string; nodeType: string }> } | null;
  const currentSnap = versionData.snapshot_json as FigmaSnapshot;
  const prevSnap = prevVersion?.snapshot_json as FigmaSnapshot | undefined;

  const nodeDiffs: Array<{
    nodeId: string; nodeName: string; nodeType: string;
    changes: unknown[]; kind: 'modified' | 'added' | 'removed';
    before_svg_b64: string | null; after_svg_b64: string | null;
  }> = [];

  if (delta) {
    for (const nd of delta.modified) {
      nodeDiffs.push({
        nodeId: nd.nodeId, nodeName: nd.nodeName, nodeType: nd.nodeType,
        changes: nd.changes, kind: 'modified',
        before_svg_b64: prevSnap ? toNodeSvgB64(prevSnap, nd.nodeId) : null,
        after_svg_b64:  toNodeSvgB64(currentSnap, nd.nodeId),
      });
    }
    for (const nd of delta.added) {
      nodeDiffs.push({
        nodeId: nd.nodeId, nodeName: nd.nodeName, nodeType: nd.nodeType,
        changes: [], kind: 'added',
        before_svg_b64: null,
        after_svg_b64:  toNodeSvgB64(currentSnap, nd.nodeId),
      });
    }
    for (const nd of delta.removed) {
      nodeDiffs.push({
        nodeId: nd.nodeId, nodeName: nd.nodeName, nodeType: nd.nodeType,
        changes: [], kind: 'removed',
        before_svg_b64: prevSnap ? toNodeSvgB64(prevSnap, nd.nodeId) : null,
        after_svg_b64:  null,
      });
    }
  }

  return c.json({ version: versionData, prev_version: prevVersion, svg_b64: svgB64, prev_svg_b64: prevSvgB64, node_diffs: nodeDiffs });
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
