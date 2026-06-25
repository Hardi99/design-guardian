import type { SupabaseClient } from '@supabase/supabase-js';
import type { FigmaSnapshot, DeltaJSON } from '../types/figma.js';
import type { Version } from '../types/database.js';

const SNAPSHOTS_BUCKET = 'snapshots';

type StorageApi = SupabaseClient['storage'];

export function snapshotPath(assetId: string, branch: string, versionNumber: number): string {
  const safeBranch = branch.replace(/[^a-zA-Z0-9-_]/g, '_');
  return `${assetId}/${safeBranch}/v${versionNumber}.json`;
}

export async function uploadSnapshot(storage: StorageApi, path: string, snapshot: FigmaSnapshot): Promise<{ error: { message: string } | null }> {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  return storage.from(SNAPSHOTS_BUCKET).upload(path, bytes, { contentType: 'application/json', upsert: false });
}

export async function downloadSnapshot(storage: StorageApi, path: string): Promise<FigmaSnapshot | null> {
  const { data, error } = await storage.from(SNAPSHOTS_BUCKET).download(path);
  if (error || !data) return null;
  try { return JSON.parse(await data.text()) as FigmaSnapshot; } catch { return null; }
}

export async function resolveSnapshot(
  storage: StorageApi,
  version: { snapshot_json: FigmaSnapshot | null; storage_path: string | null },
): Promise<FigmaSnapshot | null> {
  if (version.storage_path) return downloadSnapshot(storage, version.storage_path);
  return version.snapshot_json ?? null;
}

export interface PrevVersion { id: string; version_number: number; storage_path: string | null }

export interface CreateVersionInput {
  assetId: string;
  branchName: string;
  snapshot: FigmaSnapshot;
  renderB64?: string | null;
  figmaNodeId?: string | null;
  author: { figma_id: string; name: string; avatar_url?: string };
  computeMeta: (prev: PrevVersion | null) => Promise<{ analysisJson: DeltaJSON | null; aiSummary: string | null }>;
}

export type CreateVersionResult =
  | { ok: true; version: Version; prev: PrevVersion | null; analysisJson: DeltaJSON | null }
  | { ok: false; status: 404 | 409 | 500; error: string };

const MAX_ATTEMPTS = 5;

/**
 * Crée une version de façon atomique vis-à-vis de la concurrence :
 * claim d'un numéro libre → upload snapshot (upsert:false) → insert. Sur collision
 * (23505 ou upload déjà présent) on incrémente et on réessaie. computeMeta est appelé
 * à chaque tentative avec le `prev` réel du slot retenu (diff calculé pour le bon parent).
 */
export async function createVersionAtomic(
  db: SupabaseClient,
  storage: StorageApi,
  input: CreateVersionInput,
): Promise<CreateVersionResult> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data: prev } = await db
      .from('versions')
      .select('id, version_number, storage_path')
      .eq('asset_id', input.assetId)
      .eq('branch_name', input.branchName)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    const prevTyped = (prev as PrevVersion | null) ?? null;
    const nextVersion = prevTyped ? prevTyped.version_number + 1 : 1;
    const path = snapshotPath(input.assetId, input.branchName, nextVersion);

    const { error: upErr } = await uploadSnapshot(storage, path, input.snapshot);
    if (upErr) continue; // chemin déjà pris par une requête concurrente → on réessaie

    const meta = await input.computeMeta(prevTyped);

    if (input.renderB64) {
      const renderBytes = Buffer.from(JSON.stringify({ svg_b64: input.renderB64 }));
      await storage.from(SNAPSHOTS_BUCKET).upload(path.replace('.json', '_render.json'), renderBytes, { contentType: 'application/json', upsert: true });
    }

    const { data: version, error: insErr } = await db
      .from('versions')
      .insert({
        asset_id: input.assetId,
        parent_id: prevTyped?.id ?? null,
        branch_name: input.branchName,
        version_number: nextVersion,
        author_figma_id: input.author.figma_id,
        author_name: input.author.name,
        author_avatar_url: input.author.avatar_url ?? null,
        figma_node_id: input.figmaNodeId ?? null,
        snapshot_json: null,
        storage_path: path,
        analysis_json: meta.analysisJson,
        ai_summary: meta.aiSummary,
      })
      .select()
      .single();

    if (insErr || !version) {
      await storage.from(SNAPSHOTS_BUCKET).remove([path]);
      if ((insErr as { code?: string } | null)?.code === '23505') continue; // numéro pris entre-temps
      return { ok: false, status: 500, error: insErr?.message ?? 'insert failed' };
    }

    return { ok: true, version: version as Version, prev: prevTyped, analysisJson: meta.analysisJson };
  }
  return { ok: false, status: 409, error: 'Could not allocate a free version number after retries' };
}
