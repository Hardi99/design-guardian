// Choix de l'historique affiché, sans écran de sélection : un historique par PAGE Figma.
// Le serveur refuse une capture dont la page diffère de celle que l'historique suit déjà
// (cohérence de nœud) : ouvrir l'historique d'une autre page bloquerait donc la capture.
import type { Asset } from '../store.js';

type Ctx = { pageId: string; currentId: string | null };

/** Historique de la page courante (l'ouvert d'abord, sinon le plus récent — liste triée par
 *  date décroissante), sinon un historique encore vide (réutilisable), sinon null. */
export function pickHistory(assets: Asset[], { pageId, currentId }: Ctx): Asset | null {
  // Serveur antérieur à page_id : pas de rattachement connu → ancien comportement (sinon le
  // plugin, déployé avant le backend, créerait un historique à chaque ouverture).
  if (assets.length > 0 && assets.every(a => a.page_id === undefined)) {
    return assets.find(a => a.id === currentId) ?? assets[0];
  }
  const mine = assets.filter(a => a.page_id === pageId);
  return mine.find(a => a.id === currentId) ?? mine[0]
    ?? assets.find(a => a.page_id === null && a.scope !== 'frame') ?? null;
}

/** Comme pickHistory, mais crée l'historique s'il n'y en a aucun. Un historique vide reste
 *  libre (page_id null) : parcourir des pages sans capturer n'en crée qu'un, réutilisé partout. */
export async function ensureHistory(assets: Asset[], ctx: Ctx, create: () => Promise<Asset>): Promise<Asset> {
  return pickHistory(assets, ctx) ?? { ...await create(), page_id: null, version_count: 0 };
}

/** Après une capture réussie : l'historique suit désormais la page, avec une version de plus. */
export function claimForPage(assets: Asset[], assetId: string, pageId: string): Asset[] {
  return assets.map(a => a.id === assetId ? { ...a, page_id: pageId, version_count: (a.version_count ?? 0) + 1 } : a);
}

/** Options du sélecteur de page : « Nom · N versions » pour les pages qui ont un historique. */
export function pageOptions(pages: Array<{ id: string; name: string }>, assets: Asset[]) {
  return pages.map(p => {
    const n = assets.filter(a => a.page_id === p.id).reduce((s, a) => s + (a.version_count ?? 0), 0);
    return { id: p.id, label: n ? `${p.name} · ${n} version${n > 1 ? 's' : ''}` : p.name };
  });
}
