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
 * `found` : nœuds trouvés dans le fichier ouvert → leur dg_id ('' si non stampé).
 * « Ici » = nœud trouvé ET même dg_id (un id de nœud seul peut coïncider entre fichiers).
 * Capture ancienne sans dg_id : le nœud trouvé suffit (seul indice disponible).
 */
export function classifyPresence(
  identities: readonly AssetIdentity[],
  found: ReadonlyMap<string, string>,
): { here: string[]; elsewhere: string[] } {
  const here: string[] = [];
  const elsewhere: string[] = [];
  for (const i of identities) {
    const dg = found.get(i.figma_node_id);
    const isHere = dg !== undefined && (i.dg_id === null || dg === i.dg_id);
    (isHere ? here : elsewhere).push(i.asset_id);
  }
  return { here, elsewhere };
}
