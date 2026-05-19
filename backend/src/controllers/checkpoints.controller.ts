import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getSupabaseClient, getSupabaseStorage } from '../config/supabase.js';
import { getEnv } from '../config/env.js';
import { DiffService } from '../services/diff.service.js';
import { OpenAIService } from '../services/openai.service.js';
import { pluginMiddleware } from '../middleware/plugin.middleware.js';
import { checkpointsCreatedTotal, aiSummariesGeneratedTotal } from '../services/metrics.service.js';
import { createCheckpointSchema } from '../types/api.js';
import type { CheckpointResponse, ErrorResponse } from '../types/api.js';
import type { FigmaSnapshot } from '../types/figma.js';
import type { ProjectEnv } from '../types/hono.js';

const checkpointsRouter = new Hono<ProjectEnv>();
const diffService = new DiffService();
let openai: OpenAIService;
const getOpenAI = () => (openai ??= new OpenAIService(getEnv().OPENAI_API_KEY));

const SNAPSHOTS_BUCKET = 'snapshots';

/**
 * Chemin du snapshot dans Supabase Storage.
 * Format : {asset_id}/v{version_number}.json
 */
function snapshotPath(assetId: string, versionNumber: number): string {
  return `${assetId}/v${versionNumber}.json`;
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
    .select('id, project_id')
    .eq('id', body.asset_id)
    .eq('project_id', projectId)
    .single();

  if (assetError || !asset) return c.json<ErrorResponse>({ error: 'Asset not found' }, 404);

  // 2. Version précédente sur cette branche — uniquement métadonnées + storage_path
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
  const newPath = snapshotPath(body.asset_id, nextVersion);

  // 3. Diff + résumé IA
  //    Le snapshot précédent est téléchargé depuis Storage, pas depuis PostgreSQL.
  let analysisJson = null;
  let aiSummary = null;

  if (prev?.storage_path) {
    const prevSnapshot = await downloadSnapshot(prev.storage_path);

    if (prevSnapshot) {
      const delta = diffService.compareSnapshots(prevSnapshot, body.snapshot_json as FigmaSnapshot);
      analysisJson = delta;

      if (delta.totalChanges > 0) {
        aiSummary = await getOpenAI().generatePatchNote(delta, body.author.name);
        aiSummariesGeneratedTotal.inc({ status: 'success' });
      } else {
        aiSummary = 'Aucune modification détectée.';
      }
    }
  }

  // 4. Upload du nouveau snapshot vers Supabase Storage
  const uploadedPath = await uploadSnapshot(newPath, body.snapshot_json as FigmaSnapshot);

  if (!uploadedPath) {
    return c.json<ErrorResponse>({ error: 'Failed to upload snapshot to storage' }, 500);
  }

  // 4b. Upload PNG pixel-perfect si fourni par exportAsync
  console.log('[DG] render_svg_b64:', body.render_svg_b64 ? `${body.render_svg_b64.length} chars, starts=${body.render_svg_b64.slice(0, 8)}` : 'absent');
  if (body.render_svg_b64) {
    const isPng = body.render_svg_b64.startsWith('iVBO');
    const renderPath = uploadedPath.replace('.json', isPng ? '_render.png' : '_render.svg');
    const renderBytes = Buffer.from(body.render_svg_b64, 'base64');
    const { error: renderErr } = await getSupabaseStorage()
      .from(SNAPSHOTS_BUCKET)
      .upload(renderPath, renderBytes, { contentType: isPng ? 'image/png' : 'image/svg+xml', upsert: true });
    console.log('[DG] render upload:', renderErr ? `FAILED: ${renderErr.message}` : `OK → ${renderPath}`);
  }

  // 5. Insertion en base — snapshot_json reste null, storage_path pointe vers Storage
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
  return c.json<CheckpointResponse>({ version, analysis: analysisJson, ai_summary: aiSummary }, 201);
});

export { checkpointsRouter };
