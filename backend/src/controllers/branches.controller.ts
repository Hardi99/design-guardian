import { Hono } from 'hono';
import { getSupabaseClient, getSupabaseStorage } from '../config/supabase.js';
import { pluginMiddleware } from '../middleware/plugin.middleware.js';
import { generateSvgFromSnapshot, generateSvgFromNode, findNodeById } from '../services/svg-generator.service.js';
import type { VersionTreeResponse, ApproveVersionResponse, ErrorResponse } from '../types/api.js';
import type { Version } from '../types/database.js';
import type { ProjectEnv } from '../types/hono.js';
import type { FigmaSnapshot } from '../types/figma.js';

const branchesRouter = new Hono<ProjectEnv>();

const SNAPSHOTS_BUCKET = 'snapshots';

/**
 * Résout le snapshot d'une version.
 * - Si storage_path est défini → télécharge depuis Supabase Storage (versions post-migration 008)
 * - Sinon → utilise snapshot_json directement (versions antérieures à la migration)
 */
async function resolveSnapshot(version: {
  snapshot_json: FigmaSnapshot | null;
  storage_path: string | null;
}): Promise<FigmaSnapshot | null> {
  if (version.storage_path) {
    const { data, error } = await getSupabaseStorage()
      .from(SNAPSHOTS_BUCKET)
      .download(version.storage_path);

    if (error || !data) return null;

    try {
      return JSON.parse(await data.text()) as FigmaSnapshot;
    } catch {
      return null;
    }
  }

  // Fallback : anciennes versions stockées en DB avant migration 008
  return version.snapshot_json ?? null;
}

/**
 * GET /api/branches/tree?asset_id=...
 * Returns all versions for an asset, flat list sorted by created_at.
 */
branchesRouter.get('/tree', pluginMiddleware, async (c) => {
  const { asset_id } = c.req.query();
  if (!asset_id) return c.json<ErrorResponse>({ error: 'asset_id required' }, 400);

  const supabase = getSupabaseClient();

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

  const toFullSvgB64 = (snapshot: FigmaSnapshot | null): string | null => {
    if (!snapshot) return null;
    try {
      return Buffer.from(generateSvgFromSnapshot(snapshot)).toString('base64');
    } catch { return null; }
  };

  // Tente de charger le SVG pixel-perfect depuis Storage (exportAsync)
  // Si absent, génère le SVG depuis le snapshot (fallback)
  const resolveRenderB64 = async (storagePath: string | null, snapshot: FigmaSnapshot | null): Promise<string | null> => {
    if (storagePath) {
      for (const ext of ['_render.png', '_render.svg']) {
        const renderPath = storagePath.replace('.json', ext);
        const { data } = await getSupabaseStorage().from(SNAPSHOTS_BUCKET).download(renderPath);
        if (data) return Buffer.from(await data.arrayBuffer()).toString('base64');
      }
    }
    return toFullSvgB64(snapshot);
  };

  const toNodeSvgB64 = (snapshot: FigmaSnapshot | null, nodeId: string): string | null => {
    if (!snapshot) return null;
    try {
      const node = findNodeById(snapshot.root, nodeId);
      if (!node) return null;
      return Buffer.from(generateSvgFromNode(node)).toString('base64');
    } catch { return null; }
  };

  // Fetch parent version — storage_path + snapshot_json pour compatibilité
  let prevVersion = null;
  let prevSnap: FigmaSnapshot | null = null;

  if (versionData.parent_id) {
    const { data: prev } = await supabase
      .from('versions')
      .select('id, version_number, branch_name, status, author_name, created_at, analysis_json, snapshot_json, storage_path')
      .eq('id', versionData.parent_id)
      .single();

    if (prev) {
      prevVersion = prev;
      prevSnap = await resolveSnapshot(prev);
    }
  }

  // Résoudre le snapshot courant depuis Storage ou DB selon l'âge de la version
  const currentSnap = await resolveSnapshot(versionData);

  const [svgB64, prevSvgB64] = await Promise.all([
    resolveRenderB64(versionData.storage_path, currentSnap),
    resolveRenderB64(prevVersion?.storage_path ?? null, prevSnap),
  ]);

  // Mini SVGs par nœud pour la vue node-diff
  const delta = versionData.analysis_json as {
    modified: Array<{ nodeId: string; nodeName: string; nodeType: string; changes: unknown[] }>;
    added:    Array<{ nodeId: string; nodeName: string; nodeType: string }>;
    removed:  Array<{ nodeId: string; nodeName: string; nodeType: string }>;
  } | null;

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
        before_svg_b64: toNodeSvgB64(prevSnap, nd.nodeId),
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
        before_svg_b64: toNodeSvgB64(prevSnap, nd.nodeId),
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
