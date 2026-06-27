import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

const SNAPSHOTS_BUCKET = 'snapshots';
type StorageApi = SupabaseClient['storage'];

// Énumère les blobs Storage d'un projet : {assetId}/{branch}/<file>, sur 2 niveaux de listing.
export async function collectProjectStoragePaths(
  db: SupabaseClient, storage: StorageApi, projectId: string,
): Promise<string[]> {
  const { data: assets } = await db.from('assets').select('id').eq('project_id', projectId);
  const paths: string[] = [];
  for (const a of (assets ?? []) as { id: string }[]) {
    const { data: branches } = await storage.from(SNAPSHOTS_BUCKET).list(a.id);
    for (const branch of branches ?? []) {
      const { data: files } = await storage.from(SNAPSHOTS_BUCKET).list(`${a.id}/${branch.name}`);
      for (const f of files ?? []) paths.push(`${a.id}/${branch.name}/${f.name}`);
    }
  }
  return paths;
}

// Purge un projet : blobs Storage PUIS ligne projects (cascade SQL assets/versions). Idempotent.
export async function purgeProjectData(
  db: SupabaseClient, storage: StorageApi, projectId: string,
): Promise<{ blobs: number }> {
  const paths = await collectProjectStoragePaths(db, storage, projectId);
  if (paths.length) {
    const { error } = await storage.from(SNAPSHOTS_BUCKET).remove(paths);
    if (error) throw new Error(`Storage purge failed (project ${projectId}): ${error.message}`);
  }
  const { error: delErr } = await db.from('projects').delete().eq('id', projectId);
  if (delErr) throw new Error(`Project delete failed (${projectId}): ${delErr.message}`);
  return { blobs: paths.length };
}

// Purge un compte : annule l'abonnement Stripe, purge le Storage des projets possédés,
// puis supprime l'utilisateur auth (cascade profil → projets → assets/versions → device_links).
export async function purgeAccount(
  db: SupabaseClient, storage: StorageApi, stripe: Stripe | null, userId: string,
): Promise<{ projects: number; blobs: number }> {
  const { data: profile } = await db.from('profiles').select('stripe_subscription_id').eq('id', userId).maybeSingle();
  const subId = (profile as { stripe_subscription_id: string | null } | null)?.stripe_subscription_id ?? null;
  if (stripe && subId) {
    try { await stripe.subscriptions.cancel(subId); } catch { /* déjà annulé/absent — best-effort */ }
  }

  const { data: projects } = await db.from('projects').select('id').eq('owner_id', userId);
  let blobs = 0;
  for (const p of (projects ?? []) as { id: string }[]) {
    const paths = await collectProjectStoragePaths(db, storage, p.id);
    if (paths.length) {
      const { error } = await storage.from(SNAPSHOTS_BUCKET).remove(paths);
      if (error) throw new Error(`Storage purge failed (project ${p.id}): ${error.message}`);
    }
    blobs += paths.length;
  }

  const { error: delErr } = await db.auth.admin.deleteUser(userId);
  if (delErr) throw new Error(`deleteUser failed (${userId}): ${delErr.message}`);
  return { projects: (projects ?? []).length, blobs };
}
