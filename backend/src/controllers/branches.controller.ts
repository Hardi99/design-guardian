import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getSupabaseClient, getSupabaseStorage } from '../config/supabase.js';
import { pluginMiddleware } from '../middleware/plugin.middleware.js';
import { generateSvgFromSnapshot, findNodeById } from '../services/svg-generator.service.js';
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

  // Résout l'URL signée du blob render (PNG > SVG) ou un data-URL legacy, sans download.
  // `source` indique l'origine du rendu : 'blob' = fichier binaire réel, 'legacy' = ancien JSON,
  // 'reconstruction' = SVG reconstruit depuis les propriétés natives (pas un export Figma).
  const resolveRenderUrl = async (storagePath: string | null, snapshot: FigmaSnapshot | null): Promise<{ url: string; kind: 'svg' | 'png'; source: 'blob' | 'legacy' | 'reconstruction' } | null> => {
    if (storagePath) {
      const store = getSupabaseStorage().from(SNAPSHOTS_BUCKET);
      for (const kind of ['png', 'svg'] as const) {
        const { data } = await store.createSignedUrl(storagePath.replace('.json', `_render.${kind}`), 3600);
        if (data?.signedUrl) return { url: data.signedUrl, kind, source: 'blob' };
      }
      const { data: legacy } = await store.download(storagePath.replace('.json', '_render.json'));
      if (legacy) {
        try {
          const j = JSON.parse(await legacy.text()) as { svg_b64?: string; png_b64?: string };
          if (j.png_b64) return { url: `data:image/png;base64,${j.png_b64}`, kind: 'png', source: 'legacy' };
          if (j.svg_b64) return { url: `data:image/svg+xml;base64,${j.svg_b64}`, kind: 'svg', source: 'legacy' };
        } catch { /* fallback */ }
      }
    }
    const recon = toFullSvgB64(snapshot);
    return recon ? { url: `data:image/svg+xml;base64,${recon}`, kind: 'svg', source: 'reconstruction' } : null;
  };

  // Helper : bbox d'un nœud relative à la frame root (pour le crop CSS côté plugin).
  const nodeBbox = (snapshot: FigmaSnapshot | null, nodeId: string): { x: number; y: number; w: number; h: number } | null => {
    if (!snapshot) return null;
    const node = findNodeById(snapshot.root, nodeId);
    if (!node) return null;
    return { x: node.x - snapshot.root.x, y: node.y - snapshot.root.y, w: node.width, h: node.height };
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

  const [curUrl, prevUrl] = wantThumbs
    ? await Promise.all([
        resolveRenderUrl(versionData.storage_path, currentSnap),
        resolveRenderUrl(prevVersion?.storage_path ?? null, prevSnap),
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
    before_bbox: { x: number; y: number; w: number; h: number } | null;
    after_bbox:  { x: number; y: number; w: number; h: number } | null;
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
        before_bbox: render ? nodeBbox(prevSnap, nd.nodeId) : null,
        after_bbox:  render ? nodeBbox(currentSnap, nd.nodeId) : null,
      });
    }
    for (const nd of delta.added) {
      nodeDiffs.push({
        nodeId: nd.nodeId, nodeName: nd.nodeName, nodeType: nd.nodeType,
        changes: [], kind: 'added', readable: [],
        before_bbox: null,
        after_bbox:  (wantThumbs && renderIds.has(nd.nodeId)) ? nodeBbox(currentSnap, nd.nodeId) : null,
      });
    }
    for (const nd of delta.removed) {
      nodeDiffs.push({
        nodeId: nd.nodeId, nodeName: nd.nodeName, nodeType: nd.nodeType,
        changes: [], kind: 'removed', readable: [],
        before_bbox: (wantThumbs && renderIds.has(nd.nodeId)) ? nodeBbox(prevSnap, nd.nodeId) : null,
        after_bbox:  null,
      });
    }
  }

  const blockMoves = (delta && currentSnap)
    ? (() => { const { parent, name } = buildTreeMaps(currentSnap.root); return detectBlockMoves(delta as unknown as DeltaJSON, parent, name, 3); })()
    : [];

  return c.json({
    version: versionData, prev_version: prevVersion,
    render_url: curUrl?.url ?? null,             render_kind: curUrl?.kind ?? null,
    render_source: curUrl?.source ?? null,
    prev_render_url: prevUrl?.url ?? null,        prev_render_kind: prevUrl?.kind ?? null,
    prev_render_source: prevUrl?.source ?? null,
    current_frame: currentSnap ? { w: currentSnap.root.width, h: currentSnap.root.height } : null,
    prev_frame: prevSnap ? { w: prevSnap.root.width, h: prevSnap.root.height } : null,
    node_diffs: nodeDiffs, block_moves: blockMoves,
  });
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

  // Copier le render pixel-perfect de la source si présent (best-effort) — blob binaire,
  // avec repli sur l'ancien `_render.json` (versions pré-migration) pour ne pas perdre le rendu.
  if (src.storage_path && version.storage_path) {
    const store = storage.from(SNAPSHOTS_BUCKET);
    const copies: { ext: string; ctype: string }[] = [
      { ext: 'png',  ctype: 'image/png' },
      { ext: 'svg',  ctype: 'image/svg+xml' },
      { ext: 'json', ctype: 'application/json' }, // legacy
    ];
    for (const { ext, ctype } of copies) {
      const { data: renderData } = await store.download(src.storage_path.replace('.json', `_render.${ext}`));
      if (renderData) {
        await store.upload(version.storage_path.replace('.json', `_render.${ext}`), await renderData.arrayBuffer(), { contentType: ctype, upsert: true });
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
