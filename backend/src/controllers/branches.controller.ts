import { Hono } from 'hono';
import { getSupabaseClient, getSupabaseStorage } from '../config/supabase.js';
import { pluginMiddleware } from '../middleware/plugin.middleware.js';
import { generateSvgFromSnapshot, generateSvgFromNode, findNodeById } from '../services/svg-generator.service.js';
import type { VersionTreeResponse, ApproveVersionResponse, ErrorResponse } from '../types/api.js';
import type { Version } from '../types/database.js';
import type { ProjectEnv } from '../types/hono.js';
import type { FigmaSnapshot, DeltaJSON, NodeDelta } from '../types/figma.js';
import { nodeIdsToRender } from '../services/significance.service.js';
import { formatNodeChanges, type ReadableChange } from '../services/change-format.service.js';
import { buildTreeMaps, detectBlockMoves } from '../services/block-moves.service.js';

const branchesRouter = new Hono<ProjectEnv>();

const SNAPSHOTS_BUCKET = 'snapshots';
// Plafond dur de rendus SVG par-nœud dans la vue diff : protège l'endpoint d'un
// gros delta (cascade auto-layout) qui générerait des centaines de SVG → OOM/500.
const MAX_NODE_RENDERS = 60;

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
      // SVG/PNG enveloppé en JSON (contourne la restriction MIME du bucket)
      const renderPath = storagePath.replace('.json', '_render.json');
      const { data } = await getSupabaseStorage().from(SNAPSHOTS_BUCKET).download(renderPath);
      if (data) {
        try {
          const json = JSON.parse(await data.text()) as { svg_b64?: string; png_b64?: string };
          if (json.svg_b64) return json.svg_b64;
          if (json.png_b64) return json.png_b64; // backward compat — anciennes versions PNG
        } catch { /* fallback */ }
      }
    }
    return toFullSvgB64(snapshot);
  };

  const toNodeSvgB64 = (
    snapshot: FigmaSnapshot | null,
    nodeId: string,
    fullFrameB64?: string | null
  ): string | null => {
    if (!snapshot) return null;

    // Crop from the pixel-perfect frame SVG (same source as Frame view)
    if (fullFrameB64 && !fullFrameB64.startsWith('iVBO')) {
      try {
        const node = findNodeById(snapshot.root, nodeId);
        if (!node) return null;
        // Crop serré au bbox (petit pad anti-rognage des contours) : moins de pad = moins
        // de voisins qui bavent. Le viewBox clippe déjà tout ce qui est hors fenêtre.
        const pad = 2;
        const vb = `${node.x - snapshot.root.x - pad} ${node.y - snapshot.root.y - pad} ${node.width + pad * 2} ${node.height + pad * 2}`;
        const svgStr = Buffer.from(fullFrameB64, 'base64').toString('utf-8');
        const cropped = svgStr.replace(/<svg([^>]*)>/, (_m, attrs) =>
          `<svg${attrs.replace(/\s+(?:viewBox|width|height)="[^"]*"/g, '')} viewBox="${vb}">`
        );
        return Buffer.from(cropped).toString('base64');
      } catch { /* fallback */ }
    }

    // Fallback: reconstructed SVG from snapshot properties
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
    readable: ReadableChange[];
    before_svg_b64: string | null; after_svg_b64: string | null;
  }> = [];

  if (delta) {
    // On ne génère un crop SVG que pour les nœuds NOTABLES (+ ajoutés/supprimés),
    // plafonnés : un gros diff en cascade ne doit pas produire des centaines de SVG.
    const renderIds = nodeIdsToRender(delta as unknown as DeltaJSON, MAX_NODE_RENDERS);
    for (const nd of delta.modified) {
      const render = renderIds.has(nd.nodeId);
      nodeDiffs.push({
        nodeId: nd.nodeId, nodeName: nd.nodeName, nodeType: nd.nodeType,
        changes: nd.changes, kind: 'modified',
        readable: formatNodeChanges(nd as unknown as NodeDelta),
        before_svg_b64: render ? toNodeSvgB64(prevSnap, nd.nodeId, prevSvgB64) : null,
        after_svg_b64:  render ? toNodeSvgB64(currentSnap, nd.nodeId, svgB64) : null,
      });
    }
    for (const nd of delta.added) {
      nodeDiffs.push({
        nodeId: nd.nodeId, nodeName: nd.nodeName, nodeType: nd.nodeType,
        changes: [], kind: 'added', readable: [],
        before_svg_b64: null,
        after_svg_b64:  renderIds.has(nd.nodeId) ? toNodeSvgB64(currentSnap, nd.nodeId, svgB64) : null,
      });
    }
    for (const nd of delta.removed) {
      nodeDiffs.push({
        nodeId: nd.nodeId, nodeName: nd.nodeName, nodeType: nd.nodeType,
        changes: [], kind: 'removed', readable: [],
        before_svg_b64: renderIds.has(nd.nodeId) ? toNodeSvgB64(prevSnap, nd.nodeId, prevSvgB64) : null,
        after_svg_b64:  null,
      });
    }
  }

  const blockMoves = (delta && currentSnap)
    ? (() => { const { parent, name } = buildTreeMaps(currentSnap.root); return detectBlockMoves(delta as unknown as DeltaJSON, parent, name, 3); })()
    : [];

  return c.json({ version: versionData, prev_version: prevVersion, svg_b64: svgB64, prev_svg_b64: prevSvgB64, node_diffs: nodeDiffs, block_moves: blockMoves });
});

/**
 * POST /api/branches/versions/:id/restore
 * Creates a new checkpoint on the given branch using an older version's snapshot.
 * The snapshot is fetched from Storage server-side — the frontend never needs to send it.
 */
branchesRouter.post('/versions/:id/restore', pluginMiddleware, async (c) => {
  const supabase = getSupabaseClient();
  const { branch_name, author } = await c.req.json<{
    branch_name: string;
    author: { figma_id: string; name: string; avatar_url?: string };
  }>();

  if (!branch_name) return c.json<ErrorResponse>({ error: 'branch_name required' }, 400);

  // Load source version + verify ownership
  const { data: src } = await supabase
    .from('versions')
    .select('*, assets!inner(project_id)')
    .eq('id', c.req.param('id'))
    .single();

  if (!src) return c.json<ErrorResponse>({ error: 'Version not found' }, 404);
  if ((src.assets as { project_id: string }).project_id !== c.get('projectId'))
    return c.json<ErrorResponse>({ error: 'Forbidden' }, 403);

  const snapshot = await resolveSnapshot(src);
  if (!snapshot) return c.json<ErrorResponse>({ error: 'Snapshot not found in storage' }, 404);

  // Next version number on target branch
  const { data: prev } = await supabase
    .from('versions')
    .select('id, version_number, storage_path')
    .eq('asset_id', src.asset_id)
    .eq('branch_name', branch_name)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = prev ? prev.version_number + 1 : 1;
  const safeBranch = branch_name.replace(/[^a-zA-Z0-9-_]/g, '_');
  const newPath = `${src.asset_id}/${safeBranch}/v${nextVersion}.json`;

  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  const { error: uploadErr } = await getSupabaseStorage()
    .from(SNAPSHOTS_BUCKET)
    .upload(newPath, bytes, { contentType: 'application/json', upsert: false });

  if (uploadErr) return c.json<ErrorResponse>({ error: 'Failed to upload snapshot' }, 500);

  // Copy pixel-perfect render if it exists on the source version
  if (src.storage_path) {
    const srcRender = src.storage_path.replace('.json', '_render.json');
    const { data: renderData } = await getSupabaseStorage().from(SNAPSHOTS_BUCKET).download(srcRender);
    if (renderData) {
      const renderBytes = await renderData.arrayBuffer();
      await getSupabaseStorage().from(SNAPSHOTS_BUCKET)
        .upload(newPath.replace('.json', '_render.json'), renderBytes, { contentType: 'application/json', upsert: false });
    }
  }

  const { data: version, error: versionErr } = await supabase
    .from('versions')
    .insert({
      asset_id: src.asset_id,
      parent_id: prev?.id ?? null,
      branch_name,
      version_number: nextVersion,
      author_figma_id: author.figma_id,
      author_name: author.name,
      author_avatar_url: author.avatar_url ?? null,
      figma_node_id: src.figma_node_id,
      snapshot_json: null,
      storage_path: newPath,
      analysis_json: null,
      ai_summary: `Restauration depuis v${src.version_number} (${src.branch_name})`,
    })
    .select()
    .single();

  if (versionErr || !version) {
    await getSupabaseStorage().from(SNAPSHOTS_BUCKET).remove([newPath]);
    return c.json<ErrorResponse>({ error: 'Failed to create restore checkpoint' }, 500);
  }

  return c.json({ version }, 201);
});

/**
 * GET /api/branches/versions/:id/snapshot
 * Returns the raw snapshot JSON for a version (fetched from Storage).
 * Used by the plugin to get the data needed for canvas restore.
 */
branchesRouter.get('/versions/:id/snapshot', pluginMiddleware, async (c) => {
  const supabase = getSupabaseClient();
  const { data: version } = await supabase
    .from('versions')
    .select('*, assets!inner(project_id)')
    .eq('id', c.req.param('id'))
    .single();

  if (!version) return c.json<ErrorResponse>({ error: 'Version not found' }, 404);
  if ((version.assets as { project_id: string }).project_id !== c.get('projectId'))
    return c.json<ErrorResponse>({ error: 'Forbidden' }, 403);

  const snapshot = await resolveSnapshot(version);
  if (!snapshot) return c.json<ErrorResponse>({ error: 'Snapshot not found in storage' }, 404);

  return c.json({ snapshot });
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
