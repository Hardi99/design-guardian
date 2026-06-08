// ─── UI THREAD — Preact + HTTP. Aucun accès API Figma ici. ───────────────────

import { render, h } from 'preact';
import { useState, useEffect, useCallback, useMemo, useReducer, useRef } from 'preact/hooks';
import type { MainToUI, UIToMain, FigmaSnapshot, PluginAuthor, RestorationDelta } from './types.js';
import { useAppStore } from './useAppStore.js';
import type { Asset, Version, Plan, Screen } from './store.js';
import { diffReducer, initialDiffState } from './diffReducer.js';
import type { DiffData, NodeDiffVisual, DiffAction } from './diffReducer.js';
import { timeAgo } from './utils.js';
import './ui.css';

const API_BASE = 'https://design-guardian.up.railway.app';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function api<T>(key: string, path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { 'X-API-Key': key, 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error: string; details?: string };
    throw new Error(body.details ? `${body.error}: ${body.details}` : body.error);
  }
  return res.json() as Promise<T>;
}

function send(msg: UIToMain) { parent.postMessage({ pluginMessage: msg }, '*'); }

// ─── App (routeur) ────────────────────────────────────────────────────────────

function App() {
  const screen        = useAppStore(s => s.screen);
  const setScreen     = useAppStore(s => s.setScreen);
  const setApiKey     = useAppStore(s => s.setApiKey);
  const setPlan       = useAppStore(s => s.setPlan);
  const setAuthor     = useAppStore(s => s.setAuthor);
  const setSnapshot   = useAppStore(s => s.setSnapshot);
  const setInitErr    = useAppStore(s => s.setInitErr);
  const [showUpgrade, setShowUpgrade] = useState(false);

  useEffect(() => {
    const handler = async (e: MessageEvent) => {
      const msg = e.data.pluginMessage as MainToUI;
      if (!msg) return;
      switch (msg.type) {
        case 'FILE_INFO': {
          try {
            const data = await fetch(`${API_BASE}/api/projects/auto-init`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ figma_file_key: msg.fileKey, figma_file_name: msg.fileName }),
            }).then(r => r.json()) as { api_key: string; project: { id: string; name: string; plan: string } };
            setApiKey(data.api_key);
            setPlan((data.project.plan as Plan) ?? 'free');
            setScreen('assets');
          } catch {
            setInitErr('Impossible de joindre le serveur.');
          }
          break;
        }
        case 'AUTHOR_INFO':    setAuthor(msg.author); break;
        case 'SNAPSHOT_READY': setSnapshot(msg.snapshot, msg.render_svg_b64); setScreen('checkpoint'); break;
        case 'BRANCH_CREATED': break;
        case 'BRANCH_SWITCHED': break;
        case 'ERROR': alert(`[DG] ${msg.message}`); break;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  if (screen === 'loading')    return <LoadingScreen />;
  if (screen === 'assets')     return <AssetsScreen />;
  if (screen === 'home')       return <HomeScreen onUpgrade={() => setShowUpgrade(true)} />;
  if (screen === 'diff')       return <DiffScreen />;
  if (screen === 'checkpoint') return <CheckpointScreen />;
  if (showUpgrade) return (
    <div class="flex flex-col h-screen bg-gray-950 text-white p-6 gap-4">
      <div class="flex items-center gap-3 border-b border-gray-800 pb-4">
        <button class="text-gray-500 hover:text-white text-sm" onClick={() => setShowUpgrade(false)}>←</button>
        <span class="font-medium text-sm">Passer à Pro</span>
      </div>
      <div class="flex flex-col gap-3">
        {[
          { plan: 'Free',  price: '0€',   features: ['10 checkpoints / asset', 'Diff géométrique', 'IA Patch Notes'] },
          { plan: 'Pro',   price: '9€/m', features: ['Checkpoints illimités', 'Toutes les branches', 'Export Delta JSON'] },
          { plan: 'Team',  price: '29€/m', features: ['Collaboration multi-designers', 'Gold approval flow', 'Priorité support'] },
        ].map(({ plan, price, features }) => (
          <div key={plan} class="p-4 bg-gray-900 border border-gray-800 rounded-lg flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-sm">{plan}</span>
              <span class="text-purple-400 text-sm font-mono">{price}</span>
            </div>
            {features.map(f => <p key={f} class="text-xs text-gray-400">· {f}</p>)}
          </div>
        ))}
      </div>
      <p class="text-xs text-gray-600 text-center mt-auto">Contact : design-guardian@proton.me</p>
    </div>
  );
  return <Spinner full />;
}

// ─── Loading ──────────────────────────────────────────────────────────────────

function LoadingScreen() {
  const initErr  = useAppStore(s => s.initErr);
  const setInitErr = useAppStore(s => s.setInitErr);
  return (
    <div role="status" aria-label={initErr ? 'Erreur de connexion' : 'Connexion au projet…'} class="flex flex-col items-center justify-center h-screen bg-gray-950 text-white gap-3">
      {!initErr && <Spinner />}
      {initErr ? (
        <>
          <p role="alert" class="text-red-400 text-xs text-center px-6">{initErr}</p>
          <button class="btn-secondary text-xs px-3 py-1.5" onClick={() => { setInitErr(null); send({ type: 'RETRY_INIT' }); }}>
            Réessayer
          </button>
        </>
      ) : (
        <p class="text-gray-500 text-xs" aria-hidden="true">Connexion au projet…</p>
      )}
    </div>
  );
}

// ─── Assets ───────────────────────────────────────────────────────────────────

const ASSET_TYPES = ['ui', 'logo', 'icon', 'packaging', 'illustration', 'other'] as const;

function AssetsScreen() {
  const apiKey     = useAppStore(s => s.apiKey)!;
  const setAsset   = useAppStore(s => s.setAsset);
  const setScreen  = useAppStore(s => s.setScreen);

  const [assets,    setAssets]    = useState<Asset[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [newName,   setNewName]   = useState('');
  const [newType,   setNewType]   = useState<typeof ASSET_TYPES[number]>('ui');
  const [saving,    setSaving]    = useState(false);
  const [deleting,  setDeleting]  = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [err,       setErr]       = useState<string | null>(null);

  useEffect(() => {
    api<{ assets: Asset[] }>(apiKey, '/api/assets')
      .then(d => setAssets(d.assets))
      .catch(e => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [apiKey]);

  const onSelect = useCallback((a: Asset) => { setAsset(a); setScreen('home'); }, []);

  const confirmDelete = useCallback(async (id: string) => {
    setDeleting(id); setConfirmId(null); setErr(null);
    try {
      await api(apiKey, `/api/assets/${id}`, { method: 'DELETE' });
      setAssets(prev => prev.filter(x => x.id !== id));
    } catch (err) { setErr((err as Error).message); }
    finally { setDeleting(null); }
  }, [apiKey]);

  const create = useCallback(async () => {
    if (!newName.trim()) return;
    setSaving(true); setErr(null);
    try {
      const { asset } = await api<{ asset: Asset }>(apiKey, '/api/assets', {
        method: 'POST', body: JSON.stringify({ name: newName.trim(), asset_type: newType }),
      });
      onSelect(asset);
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }, [newName, newType, apiKey, onSelect]);

  return (
    <div class="flex flex-col h-screen bg-gray-950 text-white">
      <Topbar label="Choisir un asset" />
      <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {loading && <Spinner />}
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
        {!loading && (
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
        )}
      </div>
    </div>
  );
}

// ─── Home (Timeline) ──────────────────────────────────────────────────────────

function HomeScreen({ onUpgrade }: { onUpgrade: () => void }) {
  const apiKey         = useAppStore(s => s.apiKey)!;
  const author         = useAppStore(s => s.author);
  const asset          = useAppStore(s => s.asset)!;
  const plan           = useAppStore(s => s.plan);
  const branch         = useAppStore(s => s.branch);
  const setBranch      = useAppStore(s => s.setBranch);
  const setScreen      = useAppStore(s => s.setScreen);
  const setDiffVersion = useAppStore(s => s.setDiffVersion);

  const [versions,   setVersions]   = useState<Version[]>([]);
  const [branches,   setBranches]   = useState<string[]>(['main']);
  const [loading,    setLoading]    = useState(true);
  const [newBranch,  setNewBranch]  = useState('');
  const [err,        setErr]        = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api<{ versions: Version[]; branches: string[] }>(apiKey, `/api/branches/tree?asset_id=${asset.id}`)
      .then(d => { setVersions(d.versions ?? []); setBranches(d.branches ?? ['main']); })
      .catch(e => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [apiKey, asset.id]);

  const visible = versions.filter(v => v.branch_name === branch);

  const openDiff = useCallback((v: Version) => { setDiffVersion(v); setScreen('diff'); }, []);

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

      <div class="flex-1 overflow-y-auto">
        {loading && <Spinner />}
        {err && <p role="alert" class="text-red-400 text-xs p-4">{err}</p>}
        {!loading && visible.length === 0 && (
          <div class="flex flex-col items-center justify-center py-12 px-6 text-center gap-2">
            <p class="text-gray-400 text-sm">Aucun checkpoint sur <span class="font-mono text-purple-400">{branch}</span></p>
            <p class="text-gray-600 text-xs">Sélectionne un élément dans Figma et capture.</p>
          </div>
        )}
        {visible.length > 0 && (
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
        <button class="btn-primary w-full" onClick={() => send({ type: 'REQUEST_SNAPSHOT' })} disabled={plan === 'free' && versions.length >= 10}>
          Capturer un checkpoint
        </button>
      </div>
    </div>
  );
}

function VersionRow({ v, onClick }: { v: Version; onClick?: () => void }) {
  const dot = { approved: 'bg-green-500', review: 'bg-amber-500', draft: 'bg-gray-600' }[v.status];
  const inner = (
    <>
      <div class="relative z-10 flex-shrink-0 mt-1.5">
        <div class={`w-2.5 h-2.5 rounded-full border-2 border-gray-950 ${dot}`} />
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-xs font-mono text-gray-400">v{v.version_number}</span>
          {v.status === 'approved' && <span title="Gold : version validée et approuvée — référence de qualité pour l'équipe" class="px-1.5 py-0.5 bg-green-500/10 text-green-400 text-xs rounded cursor-help">✦ Gold</span>}
          {v.status === 'review'   && <span class="px-1.5 py-0.5 bg-amber-500/10  text-amber-400  text-xs rounded">Review</span>}
          <span class="text-xs text-gray-600 ml-auto">{timeAgo(v.created_at)}</span>
        </div>
        {v.author_name && <p class="text-xs text-gray-500 mt-0.5">{v.author_name}</p>}
        {v.ai_summary  && <p class="text-xs text-gray-300 mt-1 leading-relaxed line-clamp-2">{v.ai_summary}</p>}
      </div>
    </>
  );
  if (onClick) return (
    <button
      class="w-full text-left flex items-start gap-3 py-3 hover:bg-gray-900/50 rounded-lg px-1 -mx-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-inset"
      onClick={onClick}
      aria-label={`Version ${v.version_number}${v.author_name ? ` par ${v.author_name}` : ''}${v.ai_summary ? ` — ${v.ai_summary.slice(0, 80)}` : ''}`}
    >
      {inner}
    </button>
  );
  return <div class="flex items-start gap-3 py-3">{inner}</div>;
}

// ─── Checkpoint ───────────────────────────────────────────────────────────────

function CheckpointScreen() {
  const apiKey       = useAppStore(s => s.apiKey)!;
  const author       = useAppStore(s => s.author)!;
  const asset        = useAppStore(s => s.asset)!;
  const branch       = useAppStore(s => s.branch);
  const snapshot     = useAppStore(s => s.snapshot)!;
  const renderSvgB64 = useAppStore(s => s.renderSvgB64);
  const setScreen    = useAppStore(s => s.setScreen);

  const [branchName, setBranchName] = useState(branch);
  const [loading,    setLoading]    = useState(false);
  const [saved,      setSaved]      = useState<{ summary: string | null; changes: number } | null>(null);
  const [err,        setErr]        = useState<string | null>(null);

  const save = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const data = await api<{ ai_summary: string | null; analysis: { totalChanges?: number } | null }>(
        apiKey, '/api/checkpoints', {
          method: 'POST',
          body: JSON.stringify({
            asset_id:        asset.id,
            branch_name:     branchName.trim() || 'main',
            figma_node_id:   snapshot.figmaNodeId,
            snapshot_json:   snapshot,
            render_svg_b64:  renderSvgB64,
            author: { figma_id: author.figma_id, name: author.name, avatar_url: author.avatar_url },
          }),
        }
      );
      setSaved({ summary: data.ai_summary, changes: data.analysis?.totalChanges ?? 0 });
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [apiKey, asset.id, branchName, snapshot, author, renderSvgB64]);

  if (saved) return (
    <div class="flex flex-col h-screen bg-gray-950 text-white p-6">
      <div class="flex-1 flex flex-col justify-center gap-4">
        <p class="text-green-400 font-semibold">✦ Checkpoint sauvegardé</p>
        <div class="p-4 bg-gray-900 rounded-lg border border-gray-800 flex flex-col gap-1.5">
          <p class="text-xs text-gray-500 font-mono">{branchName}</p>
          <p class="text-sm text-gray-200 leading-relaxed">{saved.summary ?? 'Aucune modification détectée.'}</p>
          {saved.changes > 0 && <p class="text-xs text-purple-400">{saved.changes} modification(s)</p>}
        </div>
      </div>
      <button class="btn-secondary w-full" onClick={() => setScreen('home')}>← Retour à la timeline</button>
    </div>
  );

  return (
    <div class="flex flex-col h-screen bg-gray-950 text-white">
      <Topbar label="Nouveau checkpoint" onBack={() => setScreen('home')} />
      <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <div class="p-3 bg-gray-900 rounded-lg border border-gray-800">
          <p class="text-xs text-gray-500 mb-0.5">Élément sélectionné</p>
          <p class="text-sm font-medium">{snapshot.figmaNodeName}</p>
          {!renderSvgB64 && <p class="text-xs text-amber-600/80 mt-1">Frame complexe — aperçu approximatif activé</p>}
        </div>
        <div>
          <label htmlFor="cp-branch" class="text-xs text-gray-500 uppercase tracking-wide">Branche</label>
          <input id="cp-branch" class="input mt-1" placeholder="main" value={branchName} onInput={e => setBranchName((e.target as HTMLInputElement).value)} />
        </div>
        {err && <p role="alert" class="text-red-400 text-xs">{err}</p>}
      </div>
      <div class="p-4 border-t border-gray-800">
        <button class="btn-primary w-full" onClick={save} disabled={loading}>
          {loading ? 'Sauvegarde…' : 'Save Checkpoint'}
        </button>
      </div>
    </div>
  );
}

// ─── Diff Viewer ──────────────────────────────────────────────────────────────

function useDiffLoader(dispatch: (a: DiffAction) => void, apiKey: string, versionId: string) {
  useEffect(() => {
    send({ type: 'RESIZE', width: 820, height: 640 });
    api<DiffData>(apiKey, `/api/branches/versions/${versionId}`)
      .then(data => dispatch({ type: 'LOAD_SUCCESS', data }))
      .catch(e => dispatch({ type: 'LOAD_ERROR', err: (e as Error).message }));
  }, [apiKey, versionId]);
}

function useRestoreListener(dispatch: (a: DiffAction) => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data?.pluginMessage as { type: string; applied?: number; skipped?: number } | undefined;
      if (!msg || msg.type !== 'RESTORE_COMPLETE') return;
      dispatch({ type: 'APPLY_COMPLETE', applied: msg.applied ?? 0, skipped: msg.skipped });
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => dispatch({ type: 'CLEAR_MSG' }), 4000);
    };
    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);
}

function useCycleStatus(dispatch: (a: DiffAction) => void, apiKey: string, versionId: string, status: Version['status']) {
  return useCallback(async () => {
    const next: Version['status'] = status === 'draft' ? 'review' : status === 'review' ? 'approved' : 'draft';
    dispatch({ type: 'STATUS_START' });
    try {
      await api(apiKey, `/api/branches/versions/${versionId}/status`, {
        method: 'PUT', body: JSON.stringify({ status: next }),
      });
      dispatch({ type: 'STATUS_SUCCESS', status: next });
    } catch (e) { dispatch({ type: 'STATUS_ERROR', err: (e as Error).message }); }
  }, [apiKey, versionId, status]);
}

function useApplyToFigma(dispatch: (a: DiffAction) => void, apiKey: string, versionId: string, svgB64: string | null, delta: RestorationDelta | null) {
  return useCallback(async () => {
    dispatch({ type: 'APPLY_START' });
    try {
      const { snapshot } = await api<{ snapshot: FigmaSnapshot }>(apiKey, `/api/branches/versions/${versionId}/snapshot`);
      send({ type: 'RESTORE_TO_FIGMA', snapshot, render_svg_b64: svgB64 ?? undefined, delta: delta ?? undefined });
    } catch (e) { dispatch({ type: 'APPLY_ERROR', err: (e as Error).message }); }
  }, [apiKey, versionId, svgB64, delta]);
}

function useRestore(
  dispatch: (a: DiffAction) => void, apiKey: string, versionId: string,
  author: PluginAuthor | null, branch: string, setScreen: (s: Screen) => void,
) {
  return useCallback(async () => {
    if (!author) return;
    dispatch({ type: 'RESTORE_START' });
    try {
      await api(apiKey, `/api/branches/versions/${versionId}/restore`, {
        method: 'POST',
        body: JSON.stringify({
          branch_name: branch,
          author: { figma_id: author.figma_id, name: author.name, avatar_url: author.avatar_url },
        }),
      });
      send({ type: 'RESIZE', width: 400, height: 600 });
      setScreen('home');
    } catch (e) { dispatch({ type: 'RESTORE_ERROR', err: (e as Error).message }); }
  }, [apiKey, versionId, author, branch]);
}

function DiffScreen() {
  const apiKey    = useAppStore(s => s.apiKey)!;
  const version   = useAppStore(s => s.diffVersion)!;
  const author    = useAppStore(s => s.author);
  const branch    = useAppStore(s => s.branch);
  const setScreen = useAppStore(s => s.setScreen);

  const [state, dispatch] = useReducer(diffReducer, version.status, initialDiffState);
  const [opacity, setOpacity] = useState(0.5);
  const [blend, setBlend] = useState<'fade' | 'diff'>('fade');

  useDiffLoader(dispatch, apiKey, version.id);
  useRestoreListener(dispatch);
  const cycleStatus  = useCycleStatus(dispatch, apiKey, version.id, state.status);
  const applyToFigma = useApplyToFigma(dispatch, apiKey, version.id, state.data?.svg_b64 ?? null, (state.data?.version.analysis_json ?? null) as RestorationDelta | null);
  const restore      = useRestore(dispatch, apiKey, version.id, author, branch, setScreen);

  const goBack = useCallback(() => { send({ type: 'RESIZE', width: 400, height: 600 }); setScreen('home'); }, []);

  const { data, loading, err, mode, status, statusBusy, restoring, applyingToFigma, restoreMsg, view } = state;
  const delta   = data?.version.analysis_json;
  const hasPrev = !!data?.prev_version;

  return (
    <div class="flex flex-col h-screen bg-gray-950 text-white">
      {/* Header */}
      <div class="flex items-center gap-2 px-4 py-3 border-b border-gray-800 flex-shrink-0">
        <button aria-label="Retour à la timeline" class="text-gray-500 hover:text-white text-sm flex-shrink-0" onClick={goBack}>←</button>
        <span class="font-medium text-sm flex-1 truncate">
          v{version.version_number}
          <span class="text-gray-500 font-normal"> · {version.branch_name}</span>
        </span>
        {/* Status toggle + tooltip explicatif */}
        <div class="relative group flex-shrink-0">
          <button
            onClick={cycleStatus} disabled={statusBusy}
            aria-label={status === 'approved' ? 'Statut : Gold. Cliquer pour repasser en Draft.' : status === 'review' ? 'Statut : Review. Cliquer pour passer en Gold.' : 'Statut : Draft. Cliquer pour soumettre en Review.'}
            class={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              status === 'approved' ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' :
              status === 'review'   ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30' :
                                      'bg-gray-800 text-gray-500 hover:bg-gray-700'
            }`}
          >
            {status === 'approved' ? '✦ Gold' : status === 'review' ? 'Review' : 'Draft'}
          </button>
          <div role="tooltip" class="hidden group-hover:block absolute top-full left-0 mt-1.5 z-50 w-56 p-2.5 bg-gray-900 border border-gray-700 rounded-lg shadow-xl text-left">
            <p class="text-[11px] font-semibold text-gray-200 mb-1">Cycle de validation</p>
            <p class="text-[10px] leading-relaxed text-gray-400">
              <span class="text-gray-500">Draft</span> (brouillon) →
              <span class="text-amber-400"> Review</span> (en relecture) →
              <span class="text-green-400"> ✦ Gold</span> (version approuvée, référence de l'équipe).
            </p>
            <p class="text-[10px] text-gray-600 mt-1">Cliquer pour changer de statut.</p>
          </div>
        </div>
        {/* Restore checkpoint */}
        {data && (
          <button onClick={restore} disabled={restoring}
            class="px-2 py-1 rounded text-xs bg-gray-800 text-gray-400 hover:bg-gray-700 flex-shrink-0 transition-colors"
            aria-label="Créer un checkpoint depuis cette version">
            {restoring ? '…' : '↩ Checkpoint'}
          </button>
        )}
        {/* Apply to Figma canvas */}
        {data && (
          <button onClick={applyToFigma} disabled={applyingToFigma}
            class="px-2 py-1 rounded text-xs bg-purple-700 text-purple-200 hover:bg-purple-600 flex-shrink-0 transition-colors"
            aria-label="Appliquer cette version sur le canvas Figma">
            {applyingToFigma ? '…' : '↩ Apply to Figma'}
          </button>
        )}
        {hasPrev && (
          <div class="flex gap-1 flex-shrink-0">
            <button aria-pressed={view === 'nodes'} class={`px-2 py-1 rounded text-xs transition-colors ${view === 'nodes' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`} onClick={() => dispatch({ type: 'SET_VIEW', view: 'nodes' })}>Nodes</button>
            <button aria-pressed={view === 'frame'} class={`px-2 py-1 rounded text-xs transition-colors ${view === 'frame' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`} onClick={() => dispatch({ type: 'SET_VIEW', view: 'frame' })}>Frame</button>
          </div>
        )}
        {hasPrev && view === 'frame' && (
          <div class="flex gap-1 flex-shrink-0">
            <button aria-pressed={mode === 'split'}   class={`px-2 py-1 rounded text-xs transition-colors ${mode === 'split'   ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`} onClick={() => dispatch({ type: 'SET_MODE', mode: 'split' })}>Split</button>
            <button aria-pressed={mode === 'overlay'} class={`px-2 py-1 rounded text-xs transition-colors ${mode === 'overlay' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`} onClick={() => dispatch({ type: 'SET_MODE', mode: 'overlay' })}>Overlay</button>
          </div>
        )}
      </div>

      {restoreMsg && <div role="status" class="px-4 py-2 bg-green-900/40 border-b border-green-800 text-green-400 text-xs flex-shrink-0">{restoreMsg}</div>}
      {loading && <Spinner full />}
      {err     && <p role="alert" class="text-red-400 text-xs p-4">{err}</p>}

      {data && (
        <div class="flex flex-1 overflow-hidden">
          {/* Visual panel */}
          <div class="flex-1 flex flex-col border-r border-gray-800 overflow-hidden">
            {!hasPrev ? (
              <div class="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center">
                <div class="w-14 h-14 rounded-2xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center">
                  <span class="text-2xl">📸</span>
                </div>
                <div class="flex flex-col gap-1">
                  <p class="text-sm font-medium text-gray-200">Checkpoint initial</p>
                  <p class="text-xs text-gray-500">Le diff visuel apparaîtra à partir de la v2</p>
                </div>
                <div class="flex flex-col gap-1.5 text-xs text-gray-600">
                  <span>{timeAgo(version.created_at)}</span>
                  {version.author_name && <span>par {version.author_name}</span>}
                </div>
              </div>
            ) : view === 'nodes' ? (
              <div class="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
                {data.node_diffs.length === 0 && (
                  <div class="flex items-center justify-center h-full">
                    <p class="text-gray-500 text-xs">Aucune modification visuelle détectée.</p>
                  </div>
                )}
                {data.node_diffs.map(nd => <NodeDiffCard key={nd.nodeId} nd={nd} />)}
              </div>
            ) : mode === 'split' ? (
              <div class="flex flex-1 overflow-hidden">
                <div class="flex-1 flex flex-col items-center justify-center border-r border-gray-800 p-3 gap-2 overflow-hidden">
                  <p class="text-xs text-gray-600 font-mono">v{data.prev_version!.version_number} — avant</p>
                  {data.prev_svg_b64
                    ? <SvgFrame b64={data.prev_svg_b64} style="flex-1 min-h-0 overflow-hidden" zoomable />
                    : <p class="text-gray-600 text-xs">Pas de visuel</p>
                  }
                </div>
                <div class="flex-1 flex flex-col items-center justify-center p-3 gap-2 overflow-hidden">
                  <p class="text-xs text-gray-600 font-mono">v{version.version_number} — après</p>
                  {data.svg_b64
                    ? <SvgFrame b64={data.svg_b64} style="flex-1 min-h-0 overflow-hidden" zoomable />
                    : <p class="text-gray-600 text-xs">Pas de visuel</p>
                  }
                </div>
              </div>
            ) : (
              <div class={`flex-1 flex flex-col items-center justify-center p-4 gap-3 overflow-hidden relative ${blend === 'diff' ? 'bg-black' : ''}`}>
                {blend === 'fade' ? (
                  <>
                    {data.prev_svg_b64 && <div class="absolute inset-0 p-4" style={{ opacity: 1 - opacity }}><SvgFrame b64={data.prev_svg_b64} style="w-full h-full" /></div>}
                    {data.svg_b64      && <div class="absolute inset-0 p-4" style={{ opacity }}><SvgFrame b64={data.svg_b64} style="w-full h-full" /></div>}
                  </>
                ) : (
                  <>
                    {data.prev_svg_b64 && <div class="absolute inset-0 p-4"><SvgFrame b64={data.prev_svg_b64} style="w-full h-full" /></div>}
                    {data.svg_b64      && <div class="absolute inset-0 p-4" style={{ mixBlendMode: 'difference' }}><SvgFrame b64={data.svg_b64} style="w-full h-full" /></div>}
                  </>
                )}
                <div class="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-gray-900/90 rounded-lg px-3 py-1.5">
                  <div class="flex gap-1">
                    <button aria-pressed={blend === 'fade'} class={`px-2 py-0.5 rounded text-xs transition-colors ${blend === 'fade' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`} onClick={() => setBlend('fade')}>Fondu</button>
                    <button aria-pressed={blend === 'diff'} class={`px-2 py-0.5 rounded text-xs transition-colors ${blend === 'diff' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`} onClick={() => setBlend('diff')}>Différence</button>
                  </div>
                  {blend === 'fade' && (
                    <div class="flex items-center gap-2">
                      <span class="text-xs text-gray-500">avant</span>
                      <input type="range" min={0} max={1} step={0.01} value={opacity}
                        aria-label="Opacité du calque précédent"
                        onInput={e => setOpacity(parseFloat((e.target as HTMLInputElement).value))}
                        class="w-24 accent-purple-500" />
                      <span class="text-xs text-gray-500">après</span>
                    </div>
                  )}
                  {blend === 'diff' && <span class="text-xs text-gray-500">Les zones modifiées s'illuminent</span>}
                </div>
              </div>
            )}
          </div>

          {/* Smart Data panel */}
          <div class="w-72 flex flex-col overflow-y-auto">
            <div class="px-4 py-3 border-b border-gray-800">
              <p class="text-xs font-semibold text-gray-300">Smart Data</p>
              {delta && <p class="text-xs text-gray-600 mt-0.5">{delta.totalChanges} modification(s)</p>}
            </div>

            {!delta && <p class="text-xs text-gray-600 p-4">Première version — aucune diff.</p>}
            {delta && delta.totalChanges === 0 && <p class="text-xs text-gray-500 p-4">Aucune modification détectée.</p>}

            {delta && [...delta.modified, ...delta.added, ...delta.removed].map(node => (
              <div key={node.nodeId} class="px-4 py-3 border-b border-gray-800/50">
                <p class="text-xs font-medium text-gray-200 mb-2 truncate" title={node.nodeName}>
                  {node.nodeName}
                  <span class="text-gray-600 font-mono ml-1 text-[10px]">{node.nodeType}</span>
                </p>
                {node.changes.map((ch, i) => (
                  <div key={i} class="flex items-start gap-2 py-0.5">
                    <span class="text-[10px] font-mono text-gray-500 w-24 flex-shrink-0 truncate" title={ch.property}>{ch.property}</span>
                    <span class="text-[10px] text-purple-400 font-mono leading-tight">
                      {ch.delta ?? `${String(ch.oldValue)} → ${String(ch.newValue)}`}
                    </span>
                  </div>
                ))}
              </div>
            ))}

            {delta && delta.added.length > 0 && (
              <div class="px-4 py-2">
                <p class="text-[10px] text-green-500 font-semibold uppercase tracking-wide">{delta.added.length} ajout(s)</p>
              </div>
            )}
            {delta && delta.removed.length > 0 && (
              <div class="px-4 py-2">
                <p class="text-[10px] text-red-400 font-semibold uppercase tracking-wide">{delta.removed.length} suppression(s)</p>
              </div>
            )}

            {version.ai_summary && (
              <div class="px-4 py-3 mt-auto border-t border-gray-800">
                <p class="text-[10px] text-gray-500 uppercase tracking-wide mb-1">IA</p>
                <p class="text-xs text-gray-300 leading-relaxed">{version.ai_summary}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function SvgFrame({ b64, style, zoomable }: { b64: string; style?: string; zoomable?: boolean }) {
  const [zoom,     setZoom]     = useState(1);
  const [pan,      setPan]      = useState({ x: 0, y: 0 });
  const [grabbing, setGrabbing] = useState(false);
  const dragRef      = useRef<{ active: boolean; lastX: number; lastY: number }>({ active: false, lastX: 0, lastY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const clampZoom = (z: number) => Math.min(4, Math.max(0.25, z));

  const clampPan = (x: number, y: number, z: number) => {
    const el = containerRef.current;
    if (!el) return { x, y };
    const margin = 80;
    const hw = el.clientWidth  * (1 + z) / 2 - margin;
    const hh = el.clientHeight * (1 + z) / 2 - margin;
    return { x: Math.min(hw, Math.max(-hw, x)), y: Math.min(hh, Math.max(-hh, y)) };
  };

  const html = useMemo(() => {
    if (b64.startsWith('iVBO')) return null;
    try {
      const svg = atob(b64);
      return svg
        .replace(/(<svg[^>]*)\s+width="[^"]*"/, '$1')
        .replace(/(<svg[^>]*)\s+height="[^"]*"/, '$1')
        .replace('<svg', '<svg style="width:100%;height:100%;display:block" preserveAspectRatio="xMidYMid meet"');
    } catch { return ''; }
  }, [b64]);

  const content = html === null
    ? <img src={`data:image/png;base64,${b64}`} class="w-full h-full object-contain" style={{ pointerEvents: 'none' }} />
    : html
      ? <div class="w-full h-full" style={{ pointerEvents: 'none' }} dangerouslySetInnerHTML={{ __html: html }} />
      : <p class="text-gray-600 text-xs">Erreur rendu</p>;

  if (!zoomable) return <div class={style ?? 'w-full h-full'}>{content}</div>;

  const isTransformed = zoom !== 1 || pan.x !== 0 || pan.y !== 0;

  return (
    <div
      ref={containerRef}
      class={`${style ?? 'w-full h-full'} relative overflow-hidden select-none`}
      style={{ cursor: grabbing ? 'grabbing' : 'grab' }}
      onWheel={(e) => {
        e.preventDefault();
        setZoom(z => {
          const nz = clampZoom(z * (e.deltaY < 0 ? 1.1 : 0.9));
          setPan(p => clampPan(p.x, p.y, nz));
          return nz;
        });
      }}
      onMouseDown={(e) => {
        dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY };
        setGrabbing(true);
        e.preventDefault();
      }}
      onMouseMove={(e) => {
        if (!dragRef.current.active) return;
        const dx = e.clientX - dragRef.current.lastX;
        const dy = e.clientY - dragRef.current.lastY;
        dragRef.current.lastX = e.clientX;
        dragRef.current.lastY = e.clientY;
        setPan(p => clampPan(p.x + dx, p.y + dy, zoom));
      }}
      onMouseUp={() => { dragRef.current.active = false; setGrabbing(false); }}
      onMouseLeave={() => { dragRef.current.active = false; setGrabbing(false); }}
    >
      <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center center', width: '100%', height: '100%' }}>
        {content}
      </div>
      {isTransformed && (
        <button
          aria-label={`Réinitialiser le zoom (${Math.round(zoom * 100)}%)`}
          class="absolute top-2 right-2 text-[10px] text-gray-400 bg-gray-900/80 px-1.5 py-0.5 rounded hover:text-white"
          onClick={(e) => { e.stopPropagation(); setZoom(1); setPan({ x: 0, y: 0 }); }}
        >
          {Math.round(zoom * 100)}% ↺
        </button>
      )}
    </div>
  );
}

function NodeThumb({ b64 }: { b64: string }) {
  const html = useMemo(() => {
    if (b64.startsWith('iVBO')) return null;
    try {
      return atob(b64)
        .replace(/(<svg[^>]*)\s+(?:width|height)="[^"]*"/g, '$1')
        .replace('<svg', '<svg style="width:100%;height:100%;display:block" preserveAspectRatio="xMidYMid meet"');
    } catch { return null; }
  }, [b64]);
  if (html === null) return <img src={`data:image/png;base64,${b64}`} class="max-w-full max-h-full object-contain" />;
  if (!html) return null;
  return <div class="w-full h-full" dangerouslySetInnerHTML={{ __html: html }} />;
}

function NodeDiffCard({ nd }: { nd: NodeDiffVisual }) {
  const kindColor = nd.kind === 'added' ? 'text-green-400 bg-green-500/10' : nd.kind === 'removed' ? 'text-red-400 bg-red-500/10' : 'text-purple-400 bg-purple-500/10';
  const kindLabel = nd.kind === 'added' ? '+ ajout' : nd.kind === 'removed' ? '− supprimé' : '~ modifié';

  return (
    <div class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden flex-shrink-0">
      <div class="flex items-center gap-2 px-3 py-2 border-b border-gray-800">
        <span class="text-xs font-medium text-gray-200 truncate flex-1" title={nd.nodeName}>{nd.nodeName}</span>
        <span class="text-[10px] text-gray-600 font-mono">{nd.nodeType}</span>
        <span class={`text-[10px] px-1.5 py-0.5 rounded font-mono ${kindColor}`}>{kindLabel}</span>
      </div>
      <div class="flex">
        <div class="flex-1 flex flex-col items-center justify-center p-2 gap-1 border-r border-gray-800 min-h-[80px] max-h-24 overflow-hidden">
          {nd.before_svg_b64 ? <NodeThumb b64={nd.before_svg_b64} /> : <span class="text-gray-700 text-xs">—</span>}
          <span class="text-[10px] text-gray-600">avant</span>
        </div>
        <div class="flex-1 flex flex-col items-center justify-center p-2 gap-1 min-h-[80px] max-h-24 overflow-hidden">
          {nd.after_svg_b64 ? <NodeThumb b64={nd.after_svg_b64} /> : <span class="text-gray-700 text-xs">—</span>}
          <span class="text-[10px] text-gray-600">après</span>
        </div>
      </div>
      {nd.changes.length > 0 && (
        <div class="px-3 py-2 border-t border-gray-800 flex flex-col gap-0.5">
          {nd.changes.map((ch, i) => (
            <div key={i} class="flex items-start gap-2">
              <span class="text-[10px] font-mono text-gray-500 w-20 flex-shrink-0 truncate">{ch.property}</span>
              <span class="text-[10px] text-purple-400 font-mono leading-tight">{ch.delta ?? `${String(ch.oldValue)} → ${String(ch.newValue)}`}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Logo({ small = false }: { small?: boolean }) {
  return (
    <div class={`flex items-center gap-2 flex-shrink-0 ${small ? '' : 'mb-8'}`}>
      <div class={`bg-purple-600 rounded-lg flex items-center justify-center font-bold text-white ${small ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm'}`}>DG</div>
      {!small && <span class="font-semibold text-lg">Design Guardian</span>}
    </div>
  );
}

function Topbar({ label, onBack }: { label: string; onBack?: () => void }) {
  return (
    <div class="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
      {onBack && <button aria-label="Retour" class="text-gray-500 hover:text-white text-sm" onClick={onBack}>←</button>}
      <span class="font-medium text-sm flex-1 truncate">{label}</span>
    </div>
  );
}

function Spinner({ full = false }: { full?: boolean }) {
  const inner = <div role="status" aria-label="Chargement…" class="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />;
  return full
    ? <div class="flex items-center justify-center h-screen bg-gray-950">{inner}</div>
    : <div class="flex justify-center py-6">{inner}</div>;
}

render(h(App, null), document.body);
