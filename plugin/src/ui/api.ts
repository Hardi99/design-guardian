// Accès réseau et messagerie vers le main thread (UI THREAD — aucun accès API Figma ici).
import type { UIToMain } from '../types.js';
import type { Plan } from '../store.js';

// Surchargeable au build (VITE_API_BASE) pour tester contre un backend local.
export const API_BASE = import.meta.env.VITE_API_BASE ?? 'https://design-guardian.up.railway.app';

// État de session partagé entre écrans, hors store (non réactif, lu au moment de l'appel).
export const session = {
  linkToken: null as string | null,
  fileName: '',            // nom du fichier Figma ouvert
  fileKey: '',             // identifiant du fichier (dg_file_id)
  lastAssetId: null as string | null, // dernier historique utilisé dans ce fichier
};

const PLAN_RANK: Record<Plan, number> = { free: 0, pro: 1, team: 2 };
export function maxPlan(a: Plan, b: Plan): Plan { return PLAN_RANK[a] >= PLAN_RANK[b] ? a : b; }

export async function api<T>(key: string, path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'X-API-Key': key, 'Content-Type': 'application/json',
      ...(session.linkToken ? { 'X-Link-Token': session.linkToken } : {}),
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error: string; details?: string };
    throw new Error(body.details ? `${body.error}: ${body.details}` : body.error);
  }
  return res.json() as Promise<T>;
}

export function send(msg: UIToMain) { parent.postMessage({ pluginMessage: msg }, '*'); }
