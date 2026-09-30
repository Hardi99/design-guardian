// Séparation d'un fichier Figma d'un projet partagé (anciennes versions du plugin : tous les
// fichiers d'un utilisateur partageaient un projet). Le plugin établit quels éléments suivis
// existent dans le fichier ouvert ; le serveur décide et déplace. Logique pure, testable.

export interface VersionIdentityRow {
  asset_id: string;
  figma_node_id: string | null;
  storage_path: string | null;
  created_at: string;
}

/** Dernière version (toutes branches) de chaque asset ayant un nœud Figma. */
export function latestPerAsset(rows: readonly VersionIdentityRow[]): Map<string, VersionIdentityRow> {
  const out = new Map<string, VersionIdentityRow>();
  for (const r of rows) {
    if (!r.figma_node_id) continue;
    const cur = out.get(r.asset_id);
    if (!cur || r.created_at > cur.created_at) out.set(r.asset_id, r);
  }
  return out;
}

export type SplitPlan =
  | { ok: true; move: string[] }
  | { ok: false; status: 403 | 409; error: string };

/**
 * `requested` : assets que le plugin a trouvés dans le fichier. Tous doivent appartenir au
 * projet courant (`owned`) : on ne récupère jamais les assets d'un autre projet. Le nouvel
 * identifiant de fichier ne doit pas déjà désigner un projet (`keyTaken`) : pas de prise
 * de contrôle d'un projet existant par ce biais.
 */
export function planSplit(p: { requested: readonly string[]; owned: readonly string[]; keyTaken: boolean }): SplitPlan {
  if (p.keyTaken) return { ok: false, status: 409, error: 'This file id is already linked to a project' };
  const owned = new Set(p.owned);
  const move = [...new Set(p.requested)];
  if (move.some(id => !owned.has(id))) return { ok: false, status: 403, error: 'Some assets do not belong to this project' };
  return { ok: true, move };
}
