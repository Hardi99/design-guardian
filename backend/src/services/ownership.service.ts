import type { SupabaseClient } from '@supabase/supabase-js';

export type OwnershipResult =
  | { version: Record<string, unknown> }
  | { error: 'not_found' | 'forbidden' };

/**
 * Charge une version et vérifie qu'elle appartient au projet (X-API-Key).
 * Le client Supabase tourne en SERVICE_KEY (RLS bypass) → ce garde applicatif
 * est la SEULE barrière cross-tenant. Renvoie la version sans la jointure `assets`.
 */
export async function loadOwnedVersion(
  db: SupabaseClient,
  versionId: string,
  projectId: string,
): Promise<OwnershipResult> {
  const { data, error } = await db
    .from('versions')
    .select('*, assets!inner(project_id)')
    .eq('id', versionId)
    .single();

  if (error || !data) return { error: 'not_found' };

  const projId = (data.assets as { project_id: string } | null)?.project_id;
  if (projId !== projectId) return { error: 'forbidden' };

  const { assets: _assets, ...version } = data as Record<string, unknown> & { assets: unknown };
  return { version };
}
