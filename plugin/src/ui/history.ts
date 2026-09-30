// Ouverture de l'historique du fichier (remplace l'écran « Choisir un asset »).
import { appStore } from '../store.js';
import type { Asset } from '../store.js';
import { api, send, session } from './api.js';
import { ensureHistory } from './historyPick.js';

export function rememberHistory(a: Asset) {
  session.lastAssetId = a.id;
  if (session.fileKey) send({ type: 'REMEMBER_ASSET', fileKey: session.fileKey, assetId: a.id });
}

/** Ouvre l'historique courant s'il existe, sinon le dernier utilisé ou le plus récent, sinon
 *  le crée au nom du fichier. Échec → écran de chargement avec « Réessayer » (RETRY_INIT). */
export async function openHistory(apiKey: string, assets: Asset[], currentId: string | null) {
  const { setAsset, setAssets, setScreen, setInitErr } = appStore.getState();
  try {
    const asset = await ensureHistory(assets, { currentId, lastId: session.lastAssetId }, async () => {
      const { asset: created } = await api<{ asset: Asset }>(apiKey, '/api/assets', {
        method: 'POST', body: JSON.stringify({ name: session.fileName || 'Historique', asset_type: 'ui' }),
      });
      setAssets([created]);
      return created;
    });
    rememberHistory(asset);
    if (asset.id !== appStore.getState().asset?.id) setAsset(asset);
    if (appStore.getState().screen === 'loading') setScreen('home');
  } catch {
    setScreen('loading');
    setInitErr('Impossible de créer l\'historique de ce fichier.');
  }
}
