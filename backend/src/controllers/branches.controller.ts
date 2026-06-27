import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getSupabaseClient, getSupabaseStorage } from '../config/supabase.js';
import { pluginMiddleware } from '../middleware/plugin.middleware.js';
import { generateSvgFromSnapshot, generateSvgFromNode, findNodeById } from '../services/svg-generator.service.js';
import type { VersionTreeResponse, ApproveVersionResponse, ErrorResponse } from '../types/api.js';
import { statusSchema, restoreSchema } from '../types/api.js';
import { createVersionAtomic, resolveSnapshot, downloadSnapshot } from '../services/versioning.service.js';
import { DiffService } from '../services/diff.service.js';
import { generateAndStoreSummary } from '../services/checkpoint-ai.service.js';
import type { Version } from '../types/database.js';
import type { ProjectEnv } from '../types/hono.js';
import type { FigmaSnapshot, DeltaJSON, NodeDelta } from '../types/figma.js';
import { nodeIdsToRender } from '../services/significance.service.js';
import { formatNodeChanges, type ReadableChange } from '../services/change-format.service.js';
import { buildTreeMaps, detectBlockMoves } from '../services/block-moves.service.js';
import { loadOwnedVersion } from '../services/ownership.service.js';

const branchesRouter = new Hono<ProjectEnv>();
const diffService = new DiffService();

const SNAPSHOTS_BUCKET = 'snapshots';
// Plafond dur de rendus SVG par-nœud dans la vue diff : protège l'endpoint d'un
// gros delta (cascade auto-layout) qui générerait des centaines de SVG → OOM/500.
const MAX_NODE_RENDERS = 60;

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

  // Tente de charger le rendu depuis Storage : blob binaire d'abord, puis legacy JSON, puis reconstruction.
  const resolveRenderB64 = async (storagePath: string | null, snapshot: FigmaSnapshot | null): Promise<string | null> => {
    if (storagePath) {
      const store = getSupabaseStorage().from(SNAPSHOTS_BUCKET);
      for (const blobExt of ['png', 'svg'] as const) {
        const { data } = await store.download(storagePath.replace('.json', `_render.${blobExt}`));
        if (data) return Buffer.from(await data.arrayBuffer()).toString('base64');
      }
      // legacy : ancien rendu enveloppé en JSON
      const { data: legacy } = await store.download(storagePath.replace('.json', '_render.json'));
      if (legacy) {
        try {
          const json = JSON.parse(await legacy.text()) as { svg_b64?: string; png_b64?: string };
          if (json.svg_b64) return json.svg_b64;
          if (json.png_b64) return json.png_b64;
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

  // Frames entières ET crops par-nœud ne sont produits que sur demande (?thumbs=1) :
  // l'appel par défaut renvoie le changelog (texte) instantané ; le plugin recharge
  // le lourd (frames + vignettes) en différé. Défaut Nodes = zéro SVG.
  const wantThumbs = c.req.query('thumbs') === '1';

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
      // Le snapshot parent ne sert qu'aux frames/crops (différés) → on ne le télécharge
      // QUE sur ?thumbs=1. Inutile sur l'appel par défaut (évite 1 download Storage).
      if (wantThumbs) prevSnap = await resolveSnapshot(getSupabaseStorage(), prev);
    }
  }

  // Résoudre le snapshot courant depuis Storage ou DB selon l'âge de la version
  const currentSnap = await resolveSnapshot(getSupabaseStorage(), versionData);

  const [svgB64, prevSvgB64] = wantThumbs
    ? await Promise.all([
        resolveRenderB64(versionData.storage_path, currentSnap),
        resolveRenderB64(prevVersion?.storage_path ?? null, prevSnap),
      ])
    : [null, null];

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
      const render = wantThumbs && renderIds.has(nd.nodeId);
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
        after_svg_b64:  (wantThumbs && renderIds.has(nd.nodeId)) ? toNodeSvgB64(currentSnap, nd.nodeId, svgB64) : null,
      });
    }
    for (const nd of delta.removed) {
      nodeDiffs.push({
        nodeId: nd.nodeId, nodeName: nd.nodeName, nodeType: nd.nodeType,
        changes: [], kind: 'removed', readable: [],
        before_svg_b64: (wantThumbs && renderIds.has(nd.nodeId)) ? toNodeSvgB64(prevSnap, nd.nodeId, prevSvgB64) : null,
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
 * EXPLICABLE : diffs the restored state against the target branch's current head and
 * fires an AI patch note (fire-and-forget).
 */
branchesRouter.post('/versions/:id/restore', pluginMiddleware, zValidator('json', restoreSchema), async (c) => {
  const supabase = getSupabaseClient();
  const storage = getSupabaseStorage();
  const { branch_name, author } = c.req.valid('json');

  // Charger la version source + vérifier l'ownership (garde partagé).
  const owned = await loadOwnedVersion(supabase, c.req.param('id'), c.get('projectId'));
  if ('error' in owned) {
    return owned.error === 'forbidden'
      ? c.json<ErrorResponse>({ error: 'Forbidden' }, 403)
      : c.json<ErrorResponse>({ error: 'Version not found' }, 404);
  }
  const src = owned.version as unknown as {
    asset_id: string; version_number: number; branch_name: string;
    figma_node_id: string | null; snapshot_json: FigmaSnapshot | null; storage_path: string | null;
  };

  const snapshot = await resolveSnapshot(storage, src);
  if (!snapshot) return c.json<ErrorResponse>({ error: 'Snapshot not found in storage' }, 404);

  // Création atomique sur la branche cible. Restore EXPLICABLE : on diffe l'état
  // restauré contre le head courant de la branche cible (ce que le restore change).
  let pendingDelta: DeltaJSON | null = null;
  const result = await createVersionAtomic(supabase, storage, {
    assetId: src.asset_id,
    branchName: branch_name,
    snapshot,
    renderB64: null, // le render pixel-perfect est copié depuis la source ci-dessous
    figmaNodeId: src.figma_node_id,
    author,
    computeMeta: async (prev) => {
      pendingDelta = null; // reset par tentative : sur retry 23505, seul le dernier slot fait foi
      const baseSummary = `Restauration depuis v${src.version_number} (${src.branch_name})`;
      if (!prev?.storage_path) return { analysisJson: null, aiSummary: baseSummary };
      const headSnap = await downloadSnapshot(storage, prev.storage_path);
      if (!headSnap) return { analysisJson: null, aiSummary: baseSummary };
      const delta = diffService.compareSnapshots(headSnap, snapshot);
      if (delta.totalChanges > 0) pendingDelta = delta;
      return { analysisJson: delta.totalChanges > 0 ? delta : null, aiSummary: baseSummary };
    },
  });

  if (!result.ok) return c.json<ErrorResponse>({ error: result.error }, result.status);
  const { version } = result;

  // Copier le render pixel-perfect de la source si présent (best-effort) — blob binaire.
  if (src.storage_path && version.storage_path) {
    const store = storage.from(SNAPSHOTS_BUCKET);
    for (const copyExt of ['png', 'svg'] as const) {
      const { data: renderData } = await store.download(src.storage_path.replace('.json', `_render.${copyExt}`));
      if (renderData) {
        const copyCtype = copyExt === 'png' ? 'image/png' : 'image/svg+xml';
        await store.upload(version.storage_path.replace('.json', `_render.${copyExt}`), await renderData.arrayBuffer(), { contentType: copyCtype, upsert: true });
        break;
      }
    }
  }

  // Patch Note IA expliquant ce que le restore a changé (fire-and-forget) ; remplace
  // l'ai_summary constant par un résumé du delta dès qu'il est généré.
  if (pendingDelta) {
    void generateAndStoreSummary({
      versionId: version.id, delta: pendingDelta, authorName: author.name,
      branchName: branch_name, versionNumber: version.version_number, projectName: 'Design Guardian',
    });
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

  const snapshot = await resolveSnapshot(getSupabaseStorage(), version);
  if (!snapshot) return c.json<ErrorResponse>({ error: 'Snapshot not found in storage' }, 404);

  return c.json({ snapshot });
});

/**
 * PUT /api/branches/versions/:id/status
 * Update version status: draft | review | approved
 */
branchesRouter.put('/versions/:id/status', pluginMiddleware, zValidator('json', statusSchema), async (c) => {
  const id = c.req.param('id');
  const { status } = c.req.valid('json');

  const owned = await loadOwnedVersion(getSupabaseClient(), id, c.get('projectId'));
  if ('error' in owned) {
    return owned.error === 'forbidden'
      ? c.json<ErrorResponse>({ error: 'Forbidden' }, 403)
      : c.json<ErrorResponse>({ error: 'Version not found' }, 404);
  }

  const update: Partial<Version> = {
    status,
    approved_by: status === 'approved' ? c.get('projectId') : null,
    approved_at: status === 'approved' ? new Date().toISOString() : null,
  };

  const { data, error } = await getSupabaseClient()
    .from('versions').update(update).eq('id', id).select().single();

  if (error || !data) return c.json<ErrorResponse>({ error: 'Version not found', details: error?.message }, 404);
  return c.json<ApproveVersionResponse>({ version: data });
});

export { branchesRouter };
