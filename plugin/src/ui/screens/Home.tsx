import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import type { MainToUI } from '../../types.js';
import type { Version } from '../../store.js';
import { useAppStore } from '../../useAppStore.js';
import { frameHistory, defaultHomeTab } from '../../frameNav.js';
import type { FrameEntry } from '../../trackedFrames.js';
import { api, send } from '../api.js';
import { clearDiffCache } from '../diff/DiffScreen.js';
import { Header, PlanBadge } from '../components/Header.js';
import { HomeMenu } from '../components/HomeMenu.js';
import { SummaryCard } from '../components/SummaryCard.js';
import { FramesPanel } from '../components/FramesPanel.js';
import { VersionRow } from '../components/VersionRow.js';
import { Spinner } from '../components/common.js';

export function HomeScreen({ onUpgrade }: { onUpgrade: () => void }) {
  const apiKey         = useAppStore(s => s.apiKey)!;
  const asset          = useAppStore(s => s.asset)!;
  const plan           = useAppStore(s => s.plan);
  const branch         = useAppStore(s => s.branch);
  const setScreen      = useAppStore(s => s.setScreen);
  const setDiffVersion = useAppStore(s => s.setDiffVersion);
  const setSiblings    = useAppStore(s => s.setSiblings);
  const setFrame       = useAppStore(s => s.setFrame);

  const [versions, setVersions] = useState<Version[]>([]);
  // Onglet choisi par l'utilisateur ; tant qu'il n'a rien choisi, défaut selon l'historique.
  const [tabChoice, setTab]     = useState<'frames' | 'versions' | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [err,      setErr]      = useState<string | null>(null);
  const [pageName, setPageName] = useState('');
  // Garde anti-course « le frais gagne » : une réponse VERSION_CACHE (stale) arrivée
  // après le fetch frais ne doit pas écraser l'affichage à jour.
  const freshLoaded = useRef(false);

  useEffect(() => {
    setLoading(true);
    freshLoaded.current = false;
    // Rechargement de la timeline : le cache diff peut contenir des entrées d'un autre historique.
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

  // Cache stale-while-revalidate (timeline instantanée) + nom de la page courante pour l'en-tête.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data.pluginMessage as MainToUI;
      if (!msg) return;
      if (msg.type === 'FRAMES_LIST') { setPageName(msg.pageName); return; }
      if (msg.type !== 'VERSION_CACHE' || msg.assetId !== asset.id || freshLoaded.current) return;
      setVersions(msg.versions);
      setLoading(false);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [asset.id]);

  const visible = versions.filter(v => v.branch_name === branch);
  const latest  = visible.length > 0 ? visible[visible.length - 1] : null;
  const tab     = tabChoice ?? defaultHomeTab(visible);

  const openDiff = useCallback((v: Version) => { setFrame(null); setSiblings(visible); setDiffVersion(v); setScreen('diff'); }, [visible]);
  // Page-centric : clic sur une frame → son historique (versions où elle est apparue ou a changé).
  const openFrame = useCallback((f: FrameEntry) => {
    setFrame({ key: f.key, name: f.name });
    setSiblings(frameHistory(visible, f.key));
    setScreen('frameHistory');
  }, [visible]);

  const limitReached = plan === 'free' && versions.length >= 10;

  return (
    <div class="flex flex-col h-screen bg-dg-bg text-dg-text">
      <Header title={pageName || asset.name} subtitle={pageName ? asset.name : undefined}
        right={<><PlanBadge plan={plan} onUpgrade={onUpgrade} /><HomeMenu /></>} />

      {latest && <SummaryCard version={latest} onOpen={() => openDiff(latest)} />}

      {visible.length > 0 && (
        <div role="tablist" class="flex gap-1 px-3 pt-2 flex-shrink-0">
          {(['frames', 'versions'] as const).map(t => (
            <button key={t} role="tab" aria-selected={tab === t}
              class={`px-2 py-1 rounded-dg text-[11px] ${tab === t ? 'bg-dg-selected text-dg-text' : 'text-dg-text-2 hover:bg-dg-hover'}`}
              onClick={() => setTab(t)}>{t === 'frames' ? 'Frames' : 'Toutes les versions'}</button>
          ))}
        </div>
      )}

      <div class="flex-1 overflow-y-auto">
        {err && <p role="alert" class="text-dg-danger text-[11px] p-3">{err}</p>}
        {tab === 'frames' || visible.length === 0
          ? <FramesPanel versions={visible} onOpen={openFrame} />
          : loading
            ? <Spinner />
            : (
              <div class="relative px-3 py-2">
                <div class="absolute left-[15.5px] top-0 bottom-0 w-px bg-dg-border" />
                {[...visible].reverse().map(v => <VersionRow key={v.id} v={v} onClick={() => openDiff(v)} />)}
              </div>
            )}
      </div>

      <div class="p-3 border-t border-dg-border flex flex-col gap-2 flex-shrink-0">
        {limitReached && (
          <p class="text-[11px] text-dg-warning text-center">
            Limite Free atteinte (10 checkpoints). <button class="underline" onClick={onUpgrade}>Passer à Pro</button>
          </p>
        )}
        <button class="btn-primary w-full" onClick={() => send({ type: 'REQUEST_SNAPSHOT' })} disabled={limitReached}>
          Capturer un checkpoint
        </button>
      </div>
    </div>
  );
}
