import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getSupabaseClient, getSupabaseStorage } from '../config/supabase.js';
import { DiffService } from '../services/diff.service.js';
import { pluginMiddleware } from '../middleware/plugin.middleware.js';
import { checkpointsCreatedTotal } from '../services/metrics.service.js';
import { generateAndStoreSummary } from '../services/checkpoint-ai.service.js';
import { sendCheckpointNotification } from '../services/notification.service.js';
import { createCheckpointSchema } from '../types/api.js';
import { isNodeMismatch } from '../services/node-match.js';
import { createVersionAtomic, downloadSnapshot } from '../services/versioning.service.js';
import type { CheckpointResponse, ErrorResponse } from '../types/api.js';
import type { FigmaSnapshot, DeltaJSON } from '../types/figma.js';
import type { ProjectEnv } from '../types/hono.js';

const checkpointsRouter = new Hono<ProjectEnv>();
const diffService = new DiffService();

checkpointsRouter.post('/', pluginMiddleware, zValidator('json', createCheckpointSchema), async (c) => {
  const supabase = getSupabaseClient();
  const storage = getSupabaseStorage();
  const projectId = c.get('projectId');
  const body = c.req.valid('json');

  // 1. L'asset appartient-il à ce projet ?
  const { data: asset, error: assetError } = await supabase
    .from('assets').select('id, project_id, name').eq('id', body.asset_id).eq('project_id', projectId).single();
  if (assetError || !asset) return c.json<ErrorResponse>({ error: 'Asset not found' }, 404);

  // 2a. Limite plan free : 10 checkpoints / asset (toutes branches).
  if (c.get('plan') === 'free') {
    const { count } = await supabase
      .from('versions').select('id', { count: 'exact', head: true }).eq('asset_id', body.asset_id);
    if ((count ?? 0) >= 10) {
      return c.json<ErrorResponse>({ error: 'Free plan limit reached (10 checkpoints). Upgrade to continue.' }, 403);
    }
  }

  // 2b. Cohérence de nœud (dg_id stable vs id Figma volatil après restore-par-clone).
  if (body.figma_node_id) {
    const { data: prevOnBranch } = await supabase
      .from('versions').select('figma_node_id, storage_path')
      .eq('asset_id', body.asset_id).eq('branch_name', body.branch_name)
      .not('figma_node_id', 'is', null).limit(1).maybeSingle();
    if (prevOnBranch?.figma_node_id && prevOnBranch.figma_node_id !== body.figma_node_id) {
      const incomingDgId = (body.snapshot_json as FigmaSnapshot).root.dg_id;
      let prevDgId: string | undefined;
      if (prevOnBranch.storage_path) prevDgId = (await downloadSnapshot(storage, prevOnBranch.storage_path))?.root.dg_id;
      if (isNodeMismatch(
        { figmaNodeId: prevOnBranch.figma_node_id, dgId: prevDgId },
        { figmaNodeId: body.figma_node_id, dgId: incomingDgId },
      )) {
        return c.json<ErrorResponse>({ error: 'Node mismatch: this branch already tracks a different Figma element.' }, 409);
      }
    }
  }

  // 3. Création atomique. Le diff (synchrone) est calculé dans computeMeta contre le prev réel.
  let pendingDelta: DeltaJSON | null = null;
  const result = await createVersionAtomic(supabase, storage, {
    assetId: body.asset_id,
    branchName: body.branch_name,
    snapshot: body.snapshot_json as FigmaSnapshot,
    renderB64: body.render_svg_b64 ?? null,
    figmaNodeId: body.figma_node_id ?? null,
    author: body.author,
    computeMeta: async (prev) => {
      if (!prev?.storage_path) return { analysisJson: null, aiSummary: null };
      const prevSnapshot = await downloadSnapshot(storage, prev.storage_path);
      if (!prevSnapshot) return { analysisJson: null, aiSummary: null };
      const delta = diffService.compareSnapshots(prevSnapshot, body.snapshot_json as FigmaSnapshot);
      if (delta.totalChanges > 0) { pendingDelta = delta; return { analysisJson: delta, aiSummary: null }; }
      return { analysisJson: delta, aiSummary: 'Aucune modification détectée.' };
    },
  });

  if (!result.ok) return c.json<ErrorResponse>({ error: result.error }, result.status);
  const { version, analysisJson } = result;

  checkpointsCreatedTotal.inc();

  // 4. Patch Note IA en arrière-plan (fire-and-forget) ; sinon email best-effort.
  if (pendingDelta) {
    void generateAndStoreSummary({
      versionId: version.id, delta: pendingDelta, authorName: body.author.name,
      branchName: body.branch_name, versionNumber: version.version_number,
      projectName: asset.name ?? 'Design Guardian', notifyEmail: body.notify_email ?? null,
    });
  } else if (body.notify_email) {
    sendCheckpointNotification({
      to: body.notify_email, authorName: body.author.name, projectName: asset.name ?? 'Design Guardian',
      branchName: body.branch_name, versionNumber: version.version_number, aiSummary: version.ai_summary,
    }).catch(() => { /* best-effort */ });
  }

  return c.json<CheckpointResponse>({ version, analysis: analysisJson, ai_summary: version.ai_summary }, 201);
});

// GET /api/checkpoints/:id — récupère une version (pour le polling du Patch Note).
// Ownership : la version doit appartenir à un asset du projet courant.
checkpointsRouter.get('/:id', pluginMiddleware, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json<ErrorResponse>({ error: 'Checkpoint id is required' }, 400);

  const { data, error } = await getSupabaseClient()
    .from('versions')
    .select('*, assets!inner(project_id)')
    .eq('id', id)
    .eq('assets.project_id', c.get('projectId'))
    .single();

  if (error || !data) return c.json<ErrorResponse>({ error: 'Checkpoint not found' }, 404);
  return c.json({ version: data });
});

// POST /api/checkpoints/:id/regenerate — relance la génération du Patch Note
// à partir de l'analysis_json déjà stocké (pas de re-diff). Filet en cas d'échec async.
checkpointsRouter.post('/:id/regenerate', pluginMiddleware, async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json<ErrorResponse>({ error: 'Checkpoint id is required' }, 400);

  const { data: version, error } = await getSupabaseClient()
    .from('versions')
    .select('id, analysis_json, branch_name, version_number, author_name, assets!inner(project_id, name)')
    .eq('id', id)
    .eq('assets.project_id', c.get('projectId'))
    .single();

  if (error || !version) return c.json<ErrorResponse>({ error: 'Checkpoint not found' }, 404);
  if (!version.analysis_json) return c.json<ErrorResponse>({ error: 'Nothing to regenerate' }, 400);

  const assetRel = version.assets as unknown as { name: string | null };
  const ok = await generateAndStoreSummary({
    versionId: version.id,
    delta: version.analysis_json as DeltaJSON,
    authorName: version.author_name ?? 'Anonyme',
    branchName: version.branch_name,
    versionNumber: version.version_number,
    projectName: assetRel?.name ?? 'Design Guardian',
  });
  if (!ok) return c.json<ErrorResponse>({ error: 'Regeneration failed' }, 502);

  const { data: updated } = await getSupabaseClient()
    .from('versions').select('*').eq('id', id).single();
  return c.json({ version: updated });
});

export { checkpointsRouter };
