import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getSupabaseClient, getSupabaseStorage } from '../config/supabase.js';
import { DiffService } from '../services/diff.service.js';
import { pluginMiddleware } from '../middleware/plugin.middleware.js';
import { checkpointsCreatedTotal } from '../services/metrics.service.js';
import { generateAndStoreSummary } from '../services/checkpoint-ai.service.js';
import { sendCheckpointNotification } from '../services/notification.service.js';
import { createCheckpointSchema } from '../types/api.js';
import type { CheckpointResponse, ErrorResponse } from '../types/api.js';
import type { FigmaSnapshot, DeltaJSON } from '../types/figma.js';
import type { ProjectEnv } from '../types/hono.js';

const checkpointsRouter = new Hono<ProjectEnv>();
const diffService = new DiffService();

const SNAPSHOTS_BUCKET = 'snapshots';

/**
 * Chemin du snapshot dans Supabase Storage.
 * Format : {asset_id}/v{version_number}.json
 */
function snapshotPath(assetId: string, branch: string, versionNumber: number): string {
  const safeBranch = branch.replace(/[^a-zA-Z0-9-_]/g, '_');
  return `${assetId}/${safeBranch}/v${versionNumber}.json`;
}

/**
 * Télécharge et parse un snapshot depuis Supabase Storage.
 * Retourne null si le fichier est absent ou illisible.
 */
async function downloadSnapshot(path: string): Promise<FigmaSnapshot | null> {
  const { data, error } = await getSupabaseStorage()
    .from(SNAPSHOTS_BUCKET)
    .download(path);

  if (error || !data) return null;

  try {
    return JSON.parse(await data.text()) as FigmaSnapshot;
  } catch {
    return null;
  }
}

/**
 * Upload un snapshot vers Supabase Storage.
 * Retourne le path en cas de succès, null en cas d'erreur.
 */
async function uploadSnapshot(path: string, snapshot: FigmaSnapshot): Promise<string | null> {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));

  const { error } = await getSupabaseStorage()
    .from(SNAPSHOTS_BUCKET)
    .upload(path, bytes, {
      contentType: 'application/json',
      upsert: false,
    });

  return error ? null : path;
}

checkpointsRouter.post('/', pluginMiddleware, zValidator('json', createCheckpointSchema), async (c) => {
  const supabase = getSupabaseClient();
  const projectId = c.get('projectId');
  const body = c.req.valid('json');

  // 1. Vérifier que l'asset appartient à ce projet
  const { data: asset, error: assetError } = await supabase
    .from('assets')
    .select('id, project_id, name')
    .eq('id', body.asset_id)
    .eq('project_id', projectId)
    .single();

  if (assetError || !asset) return c.json<ErrorResponse>({ error: 'Asset not found' }, 404);

  // 2a. Plan limit — free plan: max 10 checkpoints per asset (all branches combined)
  if (c.get('plan') === 'free') {
    const { count } = await supabase
      .from('versions')
      .select('id', { count: 'exact', head: true })
      .eq('asset_id', body.asset_id);
    if ((count ?? 0) >= 10) {
      return c.json<ErrorResponse>({ error: 'Free plan limit reached (10 checkpoints). Upgrade to continue.' }, 403);
    }
  }

  // 2b. Node consistency — within a branch, all checkpoints must track the same Figma node
  if (body.figma_node_id) {
    const { data: prevOnBranch } = await supabase
      .from('versions')
      .select('figma_node_id')
      .eq('asset_id', body.asset_id)
      .eq('branch_name', body.branch_name)
      .not('figma_node_id', 'is', null)
      .limit(1)
      .maybeSingle();
    if (prevOnBranch?.figma_node_id && prevOnBranch.figma_node_id !== body.figma_node_id) {
      return c.json<ErrorResponse>({ error: 'Node mismatch: this branch already tracks a different Figma element.' }, 409);
    }
  }

  // 4. Version précédente sur cette branche — uniquement métadonnées + storage_path
  //    On ne charge plus snapshot_json depuis PostgreSQL.
  const { data: prev } = await supabase
    .from('versions')
    .select('id, version_number, storage_path')
    .eq('asset_id', body.asset_id)
    .eq('branch_name', body.branch_name)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = prev ? prev.version_number + 1 : 1;
  const newPath = snapshotPath(body.asset_id, body.branch_name, nextVersion);

  // 5. Diff (synchrone, rapide). La génération IA est différée APRÈS la réponse (voir plus bas).
  let analysisJson = null;
  let aiSummary: string | null = null;
  let pendingDelta: DeltaJSON | null = null;

  if (prev?.storage_path) {
    const prevSnapshot = await downloadSnapshot(prev.storage_path);

    if (prevSnapshot) {
      const delta = diffService.compareSnapshots(prevSnapshot, body.snapshot_json as FigmaSnapshot);
      analysisJson = delta;

      if (delta.totalChanges > 0) {
        pendingDelta = delta;          // génération IA différée (fire-and-forget après la réponse)
      } else {
        aiSummary = 'Aucune modification détectée.';
      }
    }
  }

  // 6. Upload du nouveau snapshot vers Supabase Storage
  const uploadedPath = await uploadSnapshot(newPath, body.snapshot_json as FigmaSnapshot);

  if (!uploadedPath) {
    return c.json<ErrorResponse>({ error: 'Failed to upload snapshot to storage' }, 500);
  }

  // 6b. Upload PNG pixel-perfect enveloppé en JSON (bucket accepte application/json uniquement)
  if (body.render_svg_b64) {
    const renderPath = uploadedPath.replace('.json', '_render.json');
    const renderBytes = Buffer.from(JSON.stringify({ svg_b64: body.render_svg_b64 }));
    const { error: renderErr } = await getSupabaseStorage()
      .from(SNAPSHOTS_BUCKET)
      .upload(renderPath, renderBytes, { contentType: 'application/json', upsert: true });
    if (renderErr) { /* render best-effort — ignore l'échec d'upload du rendu */ }
  }

  // 7. Insertion en base — snapshot_json reste null, storage_path pointe vers Storage
  const { data: version, error: versionError } = await supabase
    .from('versions')
    .insert({
      asset_id: body.asset_id,
      parent_id: prev?.id ?? null,
      branch_name: body.branch_name,
      version_number: nextVersion,
      author_figma_id: body.author.figma_id,
      author_name: body.author.name,
      author_avatar_url: body.author.avatar_url ?? null,
      figma_node_id: body.figma_node_id ?? null,
      snapshot_json: null,
      storage_path: uploadedPath,
      analysis_json: analysisJson,
      ai_summary: aiSummary,
    })
    .select()
    .single();

  if (versionError || !version) {
    // Nettoyage du snapshot orphelin si l'insertion DB échoue
    await getSupabaseStorage().from(SNAPSHOTS_BUCKET).remove([uploadedPath]);
    return c.json<ErrorResponse>({ error: 'Failed to save checkpoint', details: versionError?.message }, 500);
  }

  checkpointsCreatedTotal.inc();

  // Génération IA en arrière-plan (fire-and-forget, process long-running Railway).
  // La réponse part immédiatement avec ai_summary = null ; le plugin récupère le résumé par polling.
  if (pendingDelta) {
    void generateAndStoreSummary({
      versionId: version.id,
      delta: pendingDelta,
      authorName: body.author.name,
      branchName: body.branch_name,
      versionNumber: nextVersion,
      projectName: asset.name ?? 'Design Guardian',
      notifyEmail: body.notify_email ?? null,
    });
  } else if (body.notify_email) {
    // Cas 0-changement / premier checkpoint : email best-effort avec le résumé constant/absent
    sendCheckpointNotification({
      to: body.notify_email,
      authorName: body.author.name,
      projectName: asset.name ?? 'Design Guardian',
      branchName: body.branch_name,
      versionNumber: nextVersion,
      aiSummary,
    }).catch(() => { /* best-effort */ });
  }

  return c.json<CheckpointResponse>({ version, analysis: analysisJson, ai_summary: aiSummary }, 201);
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
