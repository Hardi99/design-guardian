import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import type { MainToUI } from '../../types.js';
import type { Version } from '../../store.js';
import { useAppStore } from '../../useAppStore.js';
import { frameHistory, hasFrameNav } from '../../frameNav.js';
import type { FrameEntry } from '../../trackedFrames.js';
import { api, send } from '../api.js';
import { clearDiffCache } from '../diff/DiffScreen.js';
import { Spinner } from '../components/common.js';
import { Header, PlanBadge } from '../components/Header.js';
import { HomeMenu } from '../components/HomeMenu.js';
import { FramesPanel } from '../components/FramesPanel.js';
import { VersionRow } from '../components/VersionRow.js';

export function HomeScreen({ onUpgrade }: { onUpgrade: () => void }) {
  const apiKey         = useAppStore(s => s.apiKey)!;
  const asset          = useAppStore(s => s.asset)!;
  const plan           = useAppStore(s => s.plan);
  const branch         = useAppStore(s => s.branch);
  const setScreen      = useAppStore(s => s.setScreen);
  const setDiffVersion = useAppStore(s => s.setDiffVersion);
  const setSiblings    = useAppStore(s => s.setSiblings);
  const setFrame       = useAppStore(s => s.setFrame);

  const [versions,   setVersions]   = useState<Version[]>([]);
  const [tab,        setTab]        = useState<'frames' | 'versions'>('frames');
  const [loading,    setLoading]    = useState(true);
  const [err,        setErr]        = useState<string | null>(null);
  // Garde anti-course « le frais gagne » : une réponse VERSION_CACHE (stale) arrivée
  // après le fetch frais ne doit pas écraser l'affichage à jour.
  const freshLoaded = useRef(false);

  useEffect(() => {
    setLoading(true);
    freshLoaded.current = false;
    // Rechargement de la timeline d'un asset : le cache diff (versionId -> payload) peut
    // contenir des entrées d'un autre asset/branche, on repart propre à chaque fois.
    clearDiffCache();
    send({ type: 'REQUEST_VERSION_CACHE', assetId: asset.id });
    api<{ versions: Version[]; branches: string[] }>(apiKey, `/api/versions/tree?asset_id=${asset.id}`)
      .then(d => {
        freshLoaded.current = true;
        setVersions(d.versions ?? []);
        send({ type: 'PERSIST_VERSION_CACHE', assetId: asset.id, versions: d.versions ?? [], branches: d.branches ?? ['main'] });
      })
      .catch(e => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [apiKey, asset.id]);

  // Cache stale-while-revalidate : affichage instantané de la timeline à la réouverture
  // d'un asset connu. Le fetch frais ci-dessus (source de vérité) écrase dès qu'il répond.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data.pluginMessage as MainToUI;
      if (!msg || msg.type !== 'VERSION_CACHE') return;
      if (msg.assetId !== asset.id) return; // bon asset uniquement (changement d'asset entre-temps)
      if (freshLoaded.current) return;      // le frais gagne s'il est déjà arrivé
      setVersions(msg.versions);
      setLoading(false);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [asset.id]);

  const visible = versions.filter(v => v.branch_name === branch);

  const openDiff = useCallback((v: Version) => { setFrame(null); setSiblings(visible); setDiffVersion(v); setScreen('diff'); }, [visible]);
  // Page-centric : clic sur une frame → son historique (versions où elle est apparue ou a changé).
  const openFrame = useCallback((f: FrameEntry) => {
    setFrame({ key: f.key, name: f.name });
    setSiblings(frameHistory(visible, f.key));
    setScreen('frameHistory');
  }, [visible]);
  const frameNav = hasFrameNav(visible);
  const showFrames = frameNav && tab === 'frames';

  return (
    <div class="flex flex-col h-screen bg-gray-950 text-white">
      <Header title={asset.name} right={<><PlanBadge plan={plan} onUpgrade={onUpgrade} /><HomeMenu /></>} />

      {frameNav && (
        <div role="tablist" class="flex gap-1 px-4 pt-2">
          {(['frames', 'versions'] as const).map(t => (
            <button key={t} role="tab" aria-selected={tab === t}
              class={`px-2.5 py-1 rounded text-xs ${tab === t ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'}`}
              onClick={() => setTab(t)}>{t === 'frames' ? 'Frames' : 'Toutes les versions'}</button>
          ))}
        </div>
      )}

      <div class="flex-1 overflow-y-auto">
        {showFrames && <div class="p-4"><FramesPanel versions={visible} onOpen={openFrame} /></div>}
        {!showFrames && loading && <Spinner />}
        {err && <p role="alert" class="text-red-400 text-xs p-4">{err}</p>}
        {!showFrames && !loading && visible.length === 0 && (
          <div class="flex flex-col items-center justify-center py-12 px-6 text-center gap-2">
            <p class="text-gray-400 text-sm">Aucun checkpoint pour l'instant</p>
            <p class="text-gray-600 text-xs">Sélectionne un élément dans Figma et capture.</p>
          </div>
        )}
        {!showFrames && visible.length > 0 && (
          <div class="relative px-4 py-3">
            <div class="absolute left-7 top-0 bottom-0 w-px bg-gray-800" />
            {[...visible].reverse().map(v => <VersionRow key={v.id} v={v} onClick={() => openDiff(v)} />)}
          </div>
        )}
      </div>

      <div class="p-4 border-t border-gray-800 flex flex-col gap-2">
        {plan === 'free' && versions.length >= 10 && (
          <p class="text-xs text-amber-400 text-center">Limite Free atteinte (10 checkpoints). <span class="underline cursor-pointer" onClick={onUpgrade}>Passer à Pro</span></p>
        )}
        {!showFrames && <FramesPanel />}
        <button class="btn-primary w-full" onClick={() => send({ type: 'REQUEST_SNAPSHOT' })} disabled={plan === 'free' && versions.length >= 10}>
          Capturer un checkpoint
        </button>
      </div>
    </div>
  );
}
