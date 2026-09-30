// Choix de l'historique affiché, sans écran de sélection : un historique par fichier Figma.
import type { Asset } from '../store.js';

type Ids = { currentId: string | null; lastId: string | null };

/** Historique ouvert s'il existe encore, sinon le dernier utilisé, sinon le plus récent
 *  (la liste du serveur est triée par date de création décroissante). */
export function pickHistory(assets: Asset[], { currentId, lastId }: Ids): Asset | null {
  return assets.find(x => x.id === currentId) ?? assets.find(x => x.id === lastId) ?? assets[0] ?? null;
}

/** Comme pickHistory, mais crée l'historique du fichier s'il n'en a aucun. */
export async function ensureHistory(assets: Asset[], ids: Ids, create: () => Promise<Asset>): Promise<Asset> {
  return pickHistory(assets, ids) ?? await create();
}
