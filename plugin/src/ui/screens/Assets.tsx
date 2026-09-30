import { useState, useCallback } from 'preact/hooks';
import { useAppStore } from '../../useAppStore.js';
import { appStore } from '../../store.js';
import type { Asset } from '../../store.js';
import { api, send } from '../api.js';
import { Topbar } from '../components/common.js';

const ASSET_TYPES = ['ui', 'logo', 'icon', 'packaging', 'illustration', 'other'] as const;

export function AssetsScreen() {
  const apiKey     = useAppStore(s => s.apiKey)!;
  const assets     = useAppStore(s => s.assets);
  const setAssets  = useAppStore(s => s.setAssets);
  const setAsset   = useAppStore(s => s.setAsset);
  const setScreen  = useAppStore(s => s.setScreen);
  const splitOffer = useAppStore(s => s.splitOffer);

  const [newName,   setNewName]   = useState('');
  const [newType,   setNewType]   = useState<typeof ASSET_TYPES[number]>('ui');
  const [saving,    setSaving]    = useState(false);
  const [deleting,  setDeleting]  = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [err,       setErr]       = useState<string | null>(null);

  const onSelect = useCallback((a: Asset) => { setAsset(a); setScreen('home'); }, []);

  const confirmDelete = useCallback(async (id: string) => {
    setDeleting(id); setConfirmId(null); setErr(null);
    try {
      await api(apiKey, `/api/assets/${id}`, { method: 'DELETE' });
      const { assets: fresh } = await api<{ assets: Asset[] }>(apiKey, '/api/assets');
      setAssets(fresh);
    } catch (err) { setErr((err as Error).message); }
    finally { setDeleting(null); }
  }, [apiKey, setAssets]);

  const create = useCallback(async () => {
    if (!newName.trim()) return;
    setSaving(true); setErr(null);
    try {
      const { asset } = await api<{ asset: Asset }>(apiKey, '/api/assets', {
        method: 'POST', body: JSON.stringify({ name: newName.trim(), asset_type: newType }),
      });
      const { assets: fresh } = await api<{ assets: Asset[] }>(apiKey, '/api/assets');
      setAssets(fresh);
      onSelect(asset);
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }, [newName, newType, apiKey, onSelect, setAssets]);

  return (
    <div class="flex flex-col h-screen bg-gray-950 text-white">
      <Topbar label="Choisir un asset" />
      <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {splitOffer && (
          <div role="status" class="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex flex-col gap-2">
            <p class="text-xs text-amber-300">
              Ce projet est partagé avec d'autres fichiers : {splitOffer.elsewhere.length} élément(s) suivi(s) ne sont pas dans ce fichier.
            </p>
            <p class="text-[11px] text-gray-400">
              Séparer ce fichier lui donne son propre historique, avec ses {splitOffer.here.length} élément(s). Les autres restent avec les autres fichiers.
            </p>
            <p class="text-[11px] text-gray-500">
              Un élément dont la page a été supprimée est aussi introuvable : s'ils appartiennent bien à ce fichier, ignorez.
            </p>
            <div class="flex gap-2">
              <button class="btn-secondary text-xs px-3 py-1.5" onClick={() => send({ type: 'SPLIT_BEGIN' })}>
                Séparer ce fichier
              </button>
              <button class="text-xs text-gray-400 hover:text-white px-3 py-1.5"
                onClick={() => { send({ type: 'SPLIT_DISMISS', assetIds: splitOffer.elsewhere }); appStore.getState().setSplitOffer(null); }}>
                Ignorer
              </button>
            </div>
          </div>
        )}
        {err && <p role="alert" class="text-red-400 text-xs">{err}</p>}
        {assets.map(a => (
          <div key={a.id} class="flex flex-col gap-1">
            <div class="flex items-center gap-2">
              <button class="flex-1 text-left p-3 bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 rounded-lg transition-colors" onClick={() => onSelect(a)}>
                <span class="text-sm font-medium">{a.name}</span>
                <span class="text-xs text-gray-600 font-mono ml-2">{a.asset_type}</span>
              </button>
              <button
                aria-label={`Supprimer ${a.name}`}
                disabled={deleting === a.id}
                class={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-colors disabled:opacity-40 ${confirmId === a.id ? 'text-red-400 bg-red-500/10' : 'text-gray-600 hover:text-red-400 hover:bg-red-500/10'}`}
                onClick={() => setConfirmId(confirmId === a.id ? null : a.id)}
              >
                {deleting === a.id ? '…' : '✕'}
              </button>
            </div>
            {confirmId === a.id && (
              <div class="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                <span class="text-xs text-red-400 flex-1">Supprimer "{a.name}" et tout son historique ?</span>
                <button class="text-xs text-gray-400 hover:text-white px-2 py-1" onClick={() => setConfirmId(null)}>Annuler</button>
                <button class="text-xs text-red-400 hover:text-red-300 font-semibold px-2 py-1" onClick={() => confirmDelete(a.id)}>Supprimer</button>
              </div>
            )}
          </div>
        ))}
        <div class="mt-2 flex flex-col gap-2">
          <label htmlFor="new-asset-name" class="text-xs text-gray-500 uppercase tracking-wide">Nouvel asset</label>
          <input id="new-asset-name" class="input" placeholder="Nom de l'asset…" value={newName} onInput={e => setNewName((e.target as HTMLInputElement).value)} />
          <div class="flex gap-1 flex-wrap">
            {ASSET_TYPES.map(t => (
              <button key={t} aria-pressed={newType === t} class={`px-2.5 py-1 rounded text-xs transition-colors ${newType === t ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`} onClick={() => setNewType(t)}>{t}</button>
            ))}
          </div>
          <button class="btn-primary" onClick={create} disabled={saving || !newName.trim()}>
            {saving ? 'Création…' : 'Créer l\'asset'}
          </button>
          {err && <p role="alert" class="text-red-400 text-xs">{err}</p>}
        </div>
      </div>
    </div>
  );
}
