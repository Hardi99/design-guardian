import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import type { MainToUI } from '../../types.js';
import type { Version } from '../../store.js';
import { useAppStore } from '../../useAppStore.js';
import { frameHistory, hasFrameNav } from '../../frameNav.js';
import type { FrameEntry } from '../../trackedFrames.js';
import { api, send } from '../api.js';
import { clearDiffCache } from '../diff/DiffScreen.js';
import { Logo, Spinner } from '../components/common.js';
import { FramesPanel } from '../components/FramesPanel.js';
import { VersionRow } from '../components/VersionRow.js';

export function HomeScreen({ onUpgrade }: { onUpgrade: () => void }) {
  const apiKey         = useAppStore(s => s.apiKey)!;
  const author         = useAppStore(s => s.author);
  const asset          = useAppStore(s => s.asset)!;
  const plan           = useAppStore(s => s.plan);
  const branch         = useAppStore(s => s.branch);
  const setBranch      = useAppStore(s => s.setBranch);
  const setScreen      = useAppStore(s => s.setScreen);
  const setDiffVersion = useAppStore(s => s.setDiffVersion);
  const setSiblings    = useAppStore(s => s.setSiblings);
  const setFrame       = useAppStore(s => s.setFrame);

  const [versions,   setVersions]   = useState<Version[]>([]);
  const [tab,        setTab]        = useState<'frames' | 'versions'>('frames');
  const [branches,   setBranches]   = useState<string[]>(['main']);
  const [loading,    setLoading]    = useState(true);
  const [newBranch,  setNewBranch]  = useState('');
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
        setBranches(d.branches ?? ['main']);
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
      setBranches(msg.branches);
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
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-800 gap-2">
        <button class="flex items-center gap-2 min-w-0" onClick={() => setScreen('assets')} title="Changer d'asset">
          <Logo small />
          <div class="min-w-0">
            <p class="text-sm font-medium truncate">{asset.name}</p>
            {author && <p class="text-xs text-gray-500 truncate">{author.name}</p>}
          </div>
        </button>
        <button
          class={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase flex-shrink-0 ${
            plan === 'team' ? 'bg-purple-500/20 text-purple-400' :
            plan === 'pro'  ? 'bg-blue-500/20 text-blue-400' :
                              'bg-gray-800 text-gray-500 cursor-pointer'
          }`}
          aria-label={plan === 'free' ? 'Plan Free — 10 checkpoints max. Cliquer pour upgrader.' : plan === 'pro' ? 'Plan Pro — Checkpoints illimités.' : 'Plan Team — Collaboration multi-designers.'}
          onClick={() => plan === 'free' && onUpgrade()}
        >{plan.toUpperCase()}</button>
      </div>

      <div class="flex items-center gap-1.5 px-4 py-2 border-b border-gray-800 overflow-x-auto">
        {branches.map(b => (
          <button key={b} aria-pressed={branch === b} class={`px-2.5 py-1 rounded text-xs font-mono whitespace-nowrap transition-colors ${branch === b ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`} onClick={() => { setBranch(b); send({ type: 'SWITCH_BRANCH', branchName: b }); }}>{b}</button>
        ))}
        <input
          aria-label="Créer une branche"
          class="bg-transparent border border-dashed border-gray-700 rounded px-2 py-1 text-xs font-mono text-gray-500 placeholder-gray-700 focus:outline-none focus:border-purple-500 focus-visible:ring-2 focus-visible:ring-purple-500 w-24"
          placeholder="+ branche" value={newBranch}
          onInput={e => setNewBranch((e.target as HTMLInputElement).value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && newBranch.trim()) {
              const b = newBranch.trim();
              if (!branches.includes(b)) setBranches(prev => [...prev, b]);
              setBranch(b);
              send({ type: 'CREATE_BRANCH', branchName: b });
              setNewBranch('');
            }
          }}
        />
      </div>

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
            <p class="text-gray-400 text-sm">Aucun checkpoint sur <span class="font-mono text-purple-400">{branch}</span></p>
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
