import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getSupabaseClient, getSupabaseStorage } from '../config/supabase.js';
import { pluginMiddleware } from '../middleware/plugin.middleware.js';
import { createAssetSchema } from '../types/api.js';
import type { AssetResponse, AssetsListResponse, ErrorResponse } from '../types/api.js';
import type { ProjectEnv } from '../types/hono.js';
import { latestPerAsset, type VersionIdentityRow } from '../services/split.service.js';
import { downloadSnapshot } from '../services/versioning.service.js';

const assetsRouter = new Hono<ProjectEnv>();

const SNAPSHOTS_BUCKET = 'snapshots';

/**
 * Nettoie les blobs Storage d'un asset (best-effort).
 * La cascade SQL supprime les lignes `versions` mais PAS les fichiers Storage.
 * Chemins : {assetId}/{branche}/v{n}.json  et  ..._render.json → énumération sur 2 niveaux.
 */
async function removeAssetStorage(assetId: string): Promise<void> {
  const bucket = getSupabaseStorage().from(SNAPSHOTS_BUCKET);
  const { data: branches } = await bucket.list(assetId);
  if (!branches?.length) return;

  const paths: string[] = [];
  for (const branch of branches) {
    const { data: files } = await bucket.list(`${assetId}/${branch.name}`);
    for (const f of files ?? []) paths.push(`${assetId}/${branch.name}/${f.name}`);
  }

  if (paths.length) {
    const { error } = await bucket.remove(paths);
    if (error) console.warn(`[DG] Storage cleanup failed for asset ${assetId}:`, error.message);
  }
}

assetsRouter.get('/', pluginMiddleware, async (c) => {
  const { data, error } = await getSupabaseClient()
    .from('assets')
    .select('*')
    .eq('project_id', c.get('projectId'))
    .order('created_at', { ascending: false });

  if (error) return c.json<ErrorResponse>({ error: 'Failed to fetch assets', details: error.message }, 500);
  return c.json<AssetsListResponse>({ assets: data });
});

// Nœud Figma + dg_id de la dernière capture de chaque asset : le plugin s'en sert pour
// vérifier quels éléments suivis existent dans le fichier ouvert (cf. split.service).
// Déclarée avant '/:id' (sinon capturée par elle).
assetsRouter.get('/identities', pluginMiddleware, async (c) => {
  const db = getSupabaseClient();
  const { data: assets, error } = await db.from('assets').select('id').eq('project_id', c.get('projectId'));
  if (error) return c.json<ErrorResponse>({ error: 'Failed to fetch assets', details: error.message }, 500);
  const ids = (assets ?? []).map(a => a.id as string);
  if (ids.length === 0) return c.json({ identities: [] });

  const { data: rows, error: vErr } = await db
    .from('versions').select('asset_id, figma_node_id, storage_path, created_at').in('asset_id', ids);
  if (vErr) return c.json<ErrorResponse>({ error: 'Failed to fetch versions', details: vErr.message }, 500);

  const storage = getSupabaseStorage();
  const identities = await Promise.all([...latestPerAsset((rows ?? []) as VersionIdentityRow[]).values()].map(async v => ({
    asset_id: v.asset_id,
    figma_node_id: v.figma_node_id as string,
    dg_id: v.storage_path ? ((await downloadSnapshot(storage, v.storage_path))?.root.dg_id ?? null) : null,
  })));
  return c.json({ identities });
});

assetsRouter.get('/:id', pluginMiddleware, async (c) => {
  const { data, error } = await getSupabaseClient()
    .from('assets')
    .select('*')
    .eq('id', c.req.param('id'))
    .eq('project_id', c.get('projectId'))
    .single();

  if (error || !data) return c.json<ErrorResponse>({ error: 'Asset not found' }, 404);
  return c.json<AssetResponse>({ asset: data });
});

assetsRouter.post('/', pluginMiddleware, zValidator('json', createAssetSchema), async (c) => {
  const body = c.req.valid('json');
  const { data, error } = await getSupabaseClient()
    .from('assets')
    .insert({ ...body, project_id: c.get('projectId'), description: body.description ?? null })
    .select()
    .single();

  if (error || !data) return c.json<ErrorResponse>({ error: 'Failed to create asset', details: error?.message }, 500);
  return c.json<AssetResponse>({ asset: data }, 201);
});

assetsRouter.delete('/:id', pluginMiddleware, async (c) => {
  const assetId = c.req.param('id');
  if (!assetId) return c.json<ErrorResponse>({ error: 'Asset id is required' }, 400);
  const projectId = c.get('projectId');
  const supabase = getSupabaseClient();

  // 1. Vérifier l'appartenance avant toute action destructive
  const { data: asset } = await supabase
    .from('assets').select('id').eq('id', assetId).eq('project_id', projectId).single();
  if (!asset) return c.json<ErrorResponse>({ error: 'Asset not found' }, 404);

  // 2. Nettoyer les blobs Storage (snapshots + rendus) — la cascade SQL ne les touche pas
  await removeAssetStorage(assetId);

  // 3. Supprimer la ligne asset → les `versions` (et leur ai_summary) partent en cascade SQL
  const { error } = await supabase
    .from('assets').delete().eq('id', assetId).eq('project_id', projectId);

  if (error) return c.json<ErrorResponse>({ error: 'Failed to delete asset', details: error.message }, 500);
  return c.json<{ message: string }>({ message: 'Asset deleted' });
});

export { assetsRouter };
