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

/** Comme pickHistory, mais crée l'historique de la page s'il n'y en a aucun. L'historique
 *  retourné est rattaché à la page (un historique vide ne resservira pas pour une autre). */
export async function ensureHistory(assets: Asset[], ctx: Ctx, create: () => Promise<Asset>): Promise<Asset> {
  return { ...(pickHistory(assets, ctx) ?? await create()), page_id: ctx.pageId };
}
