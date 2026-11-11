/**
 * Page Figma suivie par chaque historique : celle de sa première capture (`figma_node_id`
 * d'un checkpoint page-centric = id de la page). Le plugin ouvre ainsi l'historique de la
 * page courante — un historique par page, comme l'impose la cohérence de nœud du POST
 * /checkpoints.
 *  - `null` : aucune capture, historique réutilisable par n'importe quelle page ;
 *  - `''`   : captures sans identifiant (très anciennes) — ni réutilisable, ni attribuable.
 * `versions` doit être trié de la plus ancienne à la plus récente.
 */
export function withPages<A extends { id: string }>(
  assets: A[],
  versions: Array<{ asset_id: string; figma_node_id: string | null }>,
): Array<A & { page_id: string | null; version_count: number }> {
  const page = new Map<string, string>();
  const count = new Map<string, number>();
  for (const v of versions) {
    count.set(v.asset_id, (count.get(v.asset_id) ?? 0) + 1);
    const known = page.get(v.asset_id);
    if (known === undefined || (known === '' && v.figma_node_id)) page.set(v.asset_id, v.figma_node_id ?? '');
  }
  return assets.map(a => ({ ...a, page_id: page.get(a.id) ?? null, version_count: count.get(a.id) ?? 0 }));
}
