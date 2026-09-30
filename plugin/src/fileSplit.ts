// Tri des éléments suivis d'un projet PARTAGÉ entre plusieurs fichiers (anciennes versions
// du plugin : tous les fichiers d'un utilisateur partageaient un projet). Le fichier ouvert
// peut se séparer en emportant les éléments qui sont chez lui. Logique pure, testable.

/** Carte d'identité d'un élément suivi (GET /api/assets/identities). */
export interface AssetIdentity {
  asset_id: string;
  figma_node_id: string; // nœud de la dernière capture
  dg_id: string | null;  // dg_id de ce nœud à la capture (null : capture ancienne)
}

/**
 * `found` : nœuds trouvés dans le fichier ouvert par leur id → leur dg_id ('' si non stampé).
 * `dgIdsInFile` : tous les dg_id présents dans le fichier (restauration / branche : le nœud
 * est remplacé par une copie au NOUVEL id Figma qui garde son dg_id).
 * « Ici » = nœud trouvé avec le même dg_id, ou dg_id présent dans le fichier (un id de nœud
 * seul peut coïncider entre fichiers). Capture ancienne sans dg_id : le nœud trouvé suffit.
 */
export function classifyPresence(
  identities: readonly AssetIdentity[],
  found: ReadonlyMap<string, string>,
  dgIdsInFile: ReadonlySet<string> = new Set(),
): { here: string[]; elsewhere: string[] } {
  const here: string[] = [];
  const elsewhere: string[] = [];
  for (const i of identities) {
    const dg = found.get(i.figma_node_id);
    const byNode = dg !== undefined && (i.dg_id === null || dg === i.dg_id);
    const byDgId = i.dg_id !== null && dgIdsInFile.has(i.dg_id);
    (byNode || byDgId ? here : elsewhere).push(i.asset_id);
  }
  return { here, elsewhere };
}

/** Éléments « ailleurs » que l'utilisateur a choisi d'ignorer, mémorisés dans le fichier. */
export const SPLIT_DISMISSED_KEY = 'dg_split_dismissed';

/** Lecture tolérante du pluginData (JSON de chaînes) : jamais d'exception. */
export function parseDismissed(raw: string): string[] {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}

/**
 * Bandeau « Séparer » : seulement s'il existe un élément ailleurs pas encore ignoré. Un
 * élément introuvable peut appartenir au fichier (page supprimée) : une fois ignoré, il
 * ne relance plus le bandeau ; un NOUVEL élément étranger, si.
 */
export function shouldOfferSplit(elsewhere: readonly string[], dismissed: readonly string[]): boolean {
  const ignored = new Set(dismissed);
  return elsewhere.some(id => !ignored.has(id));
}
