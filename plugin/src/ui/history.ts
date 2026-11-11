// Ouverture de l'historique de la page courante (remplace l'écran « Choisir un asset »).
import { appStore } from '../store.js';
import type { Asset } from '../store.js';
import { api, session } from './api.js';
import { ensureHistory } from './historyPick.js';

/** Ouvre l'historique de la page courante, sinon un historique vide, sinon le crée au nom de
 *  la page. Échec → écran de chargement avec « Réessayer » (RETRY_INIT). */
export async function openHistory(apiKey: string, assets: Asset[], currentId: string | null) {
  const { setAsset, setAssets, setScreen, setInitErr } = appStore.getState();
  try {
    const asset = await ensureHistory(assets, { pageId: session.pageId, currentId }, async () => {
      const { asset: created } = await api<{ asset: Asset }>(apiKey, '/api/assets', {
        method: 'POST', body: JSON.stringify({ name: session.pageName || session.fileName || 'Historique', asset_type: 'ui', scope: 'page' }),
      });
      return created;
    });
    // La liste locale garde le rattachement à la page (un historique vide n'en a pas côté serveur).
    setAssets([asset, ...appStore.getState().assets.filter(a => a.id !== asset.id)]);
    if (asset.id !== appStore.getState().asset?.id) setAsset(asset);
    if (appStore.getState().screen === 'loading') setScreen('home');
  } catch {
    setScreen('loading');
    setInitErr('Impossible de créer l\'historique de cette page.');
  }
}
