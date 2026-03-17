// ─── UI THREAD — Preact + HTTP. Aucun accès API Figma ici. ───────────────────

import { render, h } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import type { MainToUI, UIToMain, FigmaSnapshot, PluginAuthor } from './types.js';
import './ui.css';

const API_BASE = 'https://design-guardian.up.railway.app';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Asset { id: string; name: string; asset_type: string }
interface Version {
  id: string; version_number: number; branch_name: string; parent_id: string | null;
  status: 'draft' | 'review' | 'approved';
  ai_summary: string | null; created_at: string;
  author_name: string | null; author_avatar_url: string | null;
}
interface PropertyChange { property: string; oldValue: unknown; newValue: unknown; delta?: string }
interface NodeDelta { nodeId: string; nodeName: string; nodeType: string; changes: PropertyChange[] }
interface DeltaJSON { modified: NodeDelta[]; added: NodeDelta[]; removed: NodeDelta[]; totalChanges: number }
type Screen = 'loading' | 'assets' | 'home' | 'checkpoint' | 'diff';
type Plan = 'free' | 'pro' | 'team';

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

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1)  return 'à l\'instant';
  if (m < 60) return `il y a ${m}min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `il y a ${h}h` : `il y a ${Math.floor(h / 24)}j`;
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  const [screen, setScreen]     = useState<Screen>('loading');
  const [apiKey, setApiKey]     = useState<string | null>(null);
  const [plan, setPlan]         = useState<Plan>('free');
  const [author, setAuthor]     = useState<PluginAuthor | null>(null);
  const [asset, setAsset]       = useState<Asset | null>(null);
  const [diffVersion, setDiffVersion] = useState<Version | null>(null);
  const [branch, setBranch]     = useState('main');
  const [snapshot, setSnapshot] = useState<FigmaSnapshot | null>(null);
  const [svg, setSvg]           = useState('');
  const [initErr, setInitErr]   = useState<string | null>(null);

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
        case 'SNAPSHOT_READY': setSnapshot(msg.snapshot); setSvg(msg.svgBase64); setScreen('checkpoint'); break;
        case 'ERROR':          alert(`[DG] ${msg.message}`); break;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  if (screen === 'loading') return (
    <div class="flex flex-col items-center justify-center h-screen bg-gray-950 text-white gap-3">
      <Spinner />
      {initErr
        ? <p class="text-red-400 text-xs text-center px-6">{initErr}</p>
        : <p class="text-gray-500 text-xs">Connexion au projet…</p>
      }
    </div>
  );

  if (screen === 'assets') return (
    <AssetsScreen apiKey={apiKey!} onSelect={a => { setAsset(a); setScreen('home'); }} />
  );

  if (screen === 'home') return (
    <HomeScreen apiKey={apiKey!} author={author} asset={asset!} plan={plan}
      branch={branch} onBranchChange={setBranch}
      onCapture={() => send({ type: 'REQUEST_SNAPSHOT' })}
      onChangeAsset={() => setScreen('assets')}
      onOpenDiff={v => { setDiffVersion(v); setScreen('diff'); }}
    />
  );

  if (screen === 'diff' && diffVersion) return (
    <DiffScreen apiKey={apiKey!} version={diffVersion} author={author} asset={asset!} branch={branch} plan={plan}
      onBack={() => { send({ type: 'RESIZE', width: 400, height: 600 }); setScreen('home'); }}
      onRestored={() => { send({ type: 'RESIZE', width: 400, height: 600 }); setScreen('home'); }}
    />
  );

  if (screen === 'checkpoint' && snapshot) return (
    <CheckpointScreen apiKey={apiKey!} author={author!} asset={asset!}
      branch={branch} snapshot={snapshot} svgBase64={svg}
      onBack={() => setScreen('home')} onSaved={() => setScreen('home')}
    />
  );

  return <Spinner full />;
}

// ─── Assets ───────────────────────────────────────────────────────────────────

const ASSET_TYPES = ['ui', 'logo', 'icon', 'packaging', 'illustration', 'other'] as const;

function AssetsScreen({ apiKey, onSelect }: { apiKey: string; onSelect: (a: Asset) => void }) {
  const [assets, setAssets]   = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<typeof ASSET_TYPES[number]>('ui');
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState<string | null>(null);

  useEffect(() => {
    api<{ assets: Asset[] }>(apiKey, '/api/assets')
      .then(d => setAssets(d.assets))
      .catch(e => setErr((e as Error).message))
      .finally(() => setLoading(false));
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
        {err && <p class="text-red-400 text-xs">{err}</p>}
        {assets.map(a => (
          <button key={a.id} class="w-full text-left p-3 bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 rounded-lg transition-colors" onClick={() => onSelect(a)}>
            <span class="text-sm font-medium">{a.name}</span>
            <span class="text-xs text-gray-600 font-mono ml-2">{a.asset_type}</span>
          </button>
        ))}
        {!loading && (
          <div class="mt-2 flex flex-col gap-2">
            <p class="text-xs text-gray-500 uppercase tracking-wide">Nouvel asset</p>
            <input class="input" placeholder="Nom de l'asset…" value={newName} onInput={e => setNewName((e.target as HTMLInputElement).value)} />
            <div class="flex gap-1 flex-wrap">
              {ASSET_TYPES.map(t => (
                <button key={t} class={`px-2.5 py-1 rounded text-xs transition-colors ${newType === t ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`} onClick={() => setNewType(t)}>{t}</button>
              ))}
            </div>
            <button class="btn-primary" onClick={create} disabled={saving || !newName.trim()}>
              {saving ? 'Création…' : 'Créer l\'asset'}
            </button>
            {err && <p class="text-red-400 text-xs">{err}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Home (Timeline) ──────────────────────────────────────────────────────────

interface HomeProps {
  apiKey: string; author: PluginAuthor | null; asset: Asset; plan: Plan;
  branch: string; onBranchChange: (b: string) => void;
  onCapture: () => void; onChangeAsset: () => void; onOpenDiff: (v: Version) => void;
}

function HomeScreen({ apiKey, author, asset, plan, branch, onBranchChange, onCapture, onChangeAsset, onOpenDiff }: HomeProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [branches, setBranches] = useState<string[]>(['main']);
  const [loading, setLoading]   = useState(true);
  const [newBranch, setNewBranch] = useState('');
  const [err, setErr]           = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api<{ versions: Version[]; branches: string[] }>(apiKey, `/api/branches/tree?asset_id=${asset.id}`)
      .then(d => { setVersions(d.versions ?? []); setBranches(d.branches ?? ['main']); })
      .catch(e => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [apiKey, asset.id]);

  const visible = versions.filter(v => v.branch_name === branch);

  return (
    <div class="flex flex-col h-screen bg-gray-950 text-white">
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-800 gap-2">
        <button class="flex items-center gap-2 min-w-0" onClick={onChangeAsset} title="Changer d'asset">
          <Logo small />
          <div class="min-w-0">
            <p class="text-sm font-medium truncate">{asset.name}</p>
            {author && <p class="text-xs text-gray-500 truncate">{author.name}</p>}
          </div>
        </button>
        <span class={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase flex-shrink-0 ${
          plan === 'team' ? 'bg-purple-500/20 text-purple-400' :
          plan === 'pro'  ? 'bg-blue-500/20 text-blue-400' :
                            'bg-gray-800 text-gray-500'
        }`}>{plan}</span>
      </div>

      <div class="flex items-center gap-1.5 px-4 py-2 border-b border-gray-800 overflow-x-auto">
        {branches.map(b => (
          <button key={b} class={`px-2.5 py-1 rounded text-xs font-mono whitespace-nowrap transition-colors ${branch === b ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`} onClick={() => onBranchChange(b)}>{b}</button>
        ))}
        <input
          class="bg-transparent border border-dashed border-gray-700 rounded px-2 py-1 text-xs font-mono text-gray-500 placeholder-gray-700 focus:outline-none focus:border-purple-500 w-24"
          placeholder="+ branche" value={newBranch}
          onInput={e => setNewBranch((e.target as HTMLInputElement).value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && newBranch.trim()) {
              const b = newBranch.trim();
              if (!branches.includes(b)) setBranches(prev => [...prev, b]);
              onBranchChange(b); setNewBranch('');
            }
          }}
        />
      </div>

      <div class="flex-1 overflow-y-auto">
        {loading && <Spinner />}
        {err && <p class="text-red-400 text-xs p-4">{err}</p>}
        {!loading && visible.length === 0 && (
          <div class="flex flex-col items-center justify-center py-12 px-6 text-center gap-2">
            <p class="text-gray-400 text-sm">Aucun checkpoint sur <span class="font-mono text-purple-400">{branch}</span></p>
            <p class="text-gray-600 text-xs">Sélectionne un élément dans Figma et capture.</p>
          </div>
        )}
        {visible.length > 0 && (
          <div class="relative px-4 py-3">
            <div class="absolute left-7 top-0 bottom-0 w-px bg-gray-800" />
            {[...visible].reverse().map(v => <VersionRow key={v.id} v={v} onClick={() => onOpenDiff(v)} />)}
          </div>
        )}
      </div>

      <div class="p-4 border-t border-gray-800 flex flex-col gap-2">
        {plan === 'free' && versions.length >= 10 && (
          <p class="text-xs text-amber-400 text-center">Limite Free atteinte (10 checkpoints). <span class="underline cursor-pointer">Passer à Pro</span></p>
        )}
        <button class="btn-primary w-full" onClick={onCapture} disabled={plan === 'free' && versions.length >= 10}>
          Capturer un checkpoint
        </button>
      </div>
    </div>
  );
}

function VersionRow({ v, onClick }: { v: Version; onClick?: () => void }) {
  const dot = { approved: 'bg-green-500', review: 'bg-amber-500', draft: 'bg-gray-600' }[v.status];
  return (
    <div class={`flex items-start gap-3 py-3 ${onClick ? 'cursor-pointer hover:bg-gray-900/50 rounded-lg px-1 -mx-1 transition-colors' : ''}`} onClick={onClick}>
      <div class="relative z-10 flex-shrink-0 mt-1.5">
        <div class={`w-2.5 h-2.5 rounded-full border-2 border-gray-950 ${dot}`} />
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-xs font-mono text-gray-400">v{v.version_number}</span>
          {v.status === 'approved' && <span class="px-1.5 py-0.5 bg-green-500/10 text-green-400 text-xs rounded">✦ Gold</span>}
          {v.status === 'review'   && <span class="px-1.5 py-0.5 bg-amber-500/10  text-amber-400  text-xs rounded">Review</span>}
          <span class="text-xs text-gray-600 ml-auto">{timeAgo(v.created_at)}</span>
        </div>
        {v.author_name && <p class="text-xs text-gray-500 mt-0.5">{v.author_name}</p>}
        {v.ai_summary  && <p class="text-xs text-gray-300 mt-1 leading-relaxed line-clamp-2">{v.ai_summary}</p>}
      </div>
    </div>
  );
}

// ─── Checkpoint ───────────────────────────────────────────────────────────────

interface CpProps {
  apiKey: string; author: PluginAuthor; asset: Asset; branch: string;
  snapshot: FigmaSnapshot; svgBase64: string;
  onBack: () => void; onSaved: () => void;
}

function CheckpointScreen({ apiKey, author, asset, branch, snapshot, svgBase64, onBack, onSaved }: CpProps) {
  const [branchName, setBranchName] = useState(branch);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved]     = useState<{ summary: string | null; changes: number } | null>(null);
  const [err, setErr]         = useState<string | null>(null);

  const save = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const data = await api<{ ai_summary: string | null; analysis: { totalChanges?: number } | null }>(
        apiKey, '/api/checkpoints', {
          method: 'POST',
          body: JSON.stringify({
            asset_id: asset.id,
            branch_name: branchName.trim() || 'main',
            figma_node_id: snapshot.figmaNodeId,
            snapshot_json: snapshot,
            svg_base64: svgBase64 || undefined,
            author: { figma_id: author.figma_id, name: author.name, avatar_url: author.avatar_url },
          }),
        }
      );
      setSaved({ summary: data.ai_summary, changes: data.analysis?.totalChanges ?? 0 });
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [apiKey, asset.id, branchName, snapshot, svgBase64, author]);

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
      <button class="btn-secondary w-full" onClick={onSaved}>← Retour à la timeline</button>
    </div>
  );

  return (
    <div class="flex flex-col h-screen bg-gray-950 text-white">
      <Topbar label="Nouveau checkpoint" onBack={onBack} />
      <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <div class="p-3 bg-gray-900 rounded-lg border border-gray-800">
          <p class="text-xs text-gray-500 mb-0.5">Élément sélectionné</p>
          <p class="text-sm font-medium">{snapshot.figmaNodeName}</p>
        </div>
        {svgBase64 && (
          <div class="bg-gray-900 rounded-lg border border-gray-800 p-3 flex justify-center" style={{ minHeight: '90px' }}>
            <img src={`data:image/svg+xml;base64,${svgBase64}`} alt="" class="max-h-24 max-w-full object-contain" />
          </div>
        )}
        <div>
          <label class="text-xs text-gray-500 uppercase tracking-wide">Branche</label>
          <input class="input mt-1" placeholder="main" value={branchName} onInput={e => setBranchName((e.target as HTMLInputElement).value)} />
        </div>
        {err && <p class="text-red-400 text-xs">{err}</p>}
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

interface DiffData {
  version: Version & { snapshot_json: unknown; analysis_json: DeltaJSON | null };
  prev_version: (Version & { snapshot_json: unknown }) | null;
  svg_b64: string | null;
  prev_svg_b64: string | null;
}

interface DiffScreenProps {
  apiKey: string; version: Version; author: PluginAuthor | null;
  asset: Asset; branch: string; plan: Plan;
  onBack: () => void; onRestored: () => void;
}

function DiffScreen({ apiKey, version, author, asset, branch, plan, onBack, onRestored }: DiffScreenProps) {
  const [data, setData]           = useState<DiffData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [err, setErr]             = useState<string | null>(null);
  const [mode, setMode]           = useState<'split' | 'overlay'>('split');
  const [opacity, setOpacity]     = useState(0.5);
  const [status, setStatus]       = useState(version.status);
  const [statusBusy, setStatusBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    send({ type: 'RESIZE', width: 820, height: 640 });
    api<DiffData>(apiKey, `/api/branches/versions/${version.id}`)
      .then(setData)
      .catch(e => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [apiKey, version.id]);

  const cycleStatus = useCallback(async () => {
    const next: Version['status'] = status === 'draft' ? 'review' : status === 'review' ? 'approved' : 'draft';
    setStatusBusy(true);
    try {
      await api(apiKey, `/api/branches/versions/${version.id}/status`, {
        method: 'PUT', body: JSON.stringify({ status: next }),
      });
      setStatus(next);
    } catch (e) { setErr((e as Error).message); }
    finally { setStatusBusy(false); }
  }, [apiKey, version.id, status]);

  const restore = useCallback(async () => {
    if (!data || !author) return;
    setRestoring(true);
    try {
      await api(apiKey, '/api/checkpoints', {
        method: 'POST',
        body: JSON.stringify({
          asset_id: asset.id,
          branch_name: branch,
          figma_node_id: (data.version.snapshot_json as FigmaSnapshot)?.figmaNodeId ?? null,
          snapshot_json: data.version.snapshot_json,
          svg_base64: undefined,
          author: { figma_id: author.figma_id, name: author.name, avatar_url: author.avatar_url },
        }),
      });
      onRestored();
    } catch (e) { setErr((e as Error).message); setRestoring(false); }
  }, [apiKey, data, author, asset.id, branch, onRestored]);

  const delta = data?.version.analysis_json;
  const hasPrev = !!data?.prev_version;

  return (
    <div class="flex flex-col h-screen bg-gray-950 text-white">
      {/* Header */}
      <div class="flex items-center gap-2 px-4 py-3 border-b border-gray-800 flex-shrink-0">
        <button class="text-gray-500 hover:text-white text-sm flex-shrink-0" onClick={onBack}>←</button>
        <span class="font-medium text-sm flex-1 truncate">
          v{version.version_number}
          <span class="text-gray-500 font-normal"> · {version.branch_name}</span>
        </span>
        {/* Status toggle */}
        <button
          onClick={cycleStatus} disabled={statusBusy}
          class={`px-2 py-1 rounded text-xs font-medium flex-shrink-0 transition-colors ${
            status === 'approved' ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' :
            status === 'review'   ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30' :
                                    'bg-gray-800 text-gray-500 hover:bg-gray-700'
          }`}
        >
          {status === 'approved' ? '✦ Gold' : status === 'review' ? 'Review' : 'Draft'}
        </button>
        {/* Restore */}
        {data && (
          <button onClick={restore} disabled={restoring}
            class="px-2 py-1 rounded text-xs bg-gray-800 text-gray-400 hover:bg-gray-700 flex-shrink-0 transition-colors"
            title="Créer un nouveau checkpoint depuis cette version">
            {restoring ? '…' : '↩ Restore'}
          </button>
        )}
        {hasPrev && (
          <div class="flex gap-1 flex-shrink-0">
            <button class={`px-2 py-1 rounded text-xs transition-colors ${mode === 'split' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`} onClick={() => setMode('split')}>Split</button>
            <button class={`px-2 py-1 rounded text-xs transition-colors ${mode === 'overlay' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`} onClick={() => setMode('overlay')}>Overlay</button>
          </div>
        )}
      </div>

      {loading && <Spinner full />}
      {err    && <p class="text-red-400 text-xs p-4">{err}</p>}

      {data && (
        <div class="flex flex-1 overflow-hidden">
          {/* Visual panel */}
          <div class="flex-1 flex flex-col border-r border-gray-800 overflow-hidden">
            {!hasPrev ? (
              <div class="flex-1 flex flex-col items-center justify-center gap-2 p-4">
                {data.svg_b64
                  ? <img src={`data:image/svg+xml;base64,${data.svg_b64}`} alt="v1" class="max-h-full max-w-full object-contain" />
                  : <p class="text-gray-500 text-xs">Première version — pas de diff disponible</p>
                }
              </div>
            ) : mode === 'split' ? (
              <div class="flex flex-1 overflow-hidden">
                <div class="flex-1 flex flex-col items-center justify-center border-r border-gray-800 p-3 gap-2 overflow-hidden">
                  <p class="text-xs text-gray-600 font-mono">v{data.prev_version!.version_number} — avant</p>
                  {data.prev_svg_b64
                    ? <img src={`data:image/svg+xml;base64,${data.prev_svg_b64}`} alt="avant" class="max-h-full max-w-full object-contain" />
                    : <p class="text-gray-600 text-xs">Pas de visuel</p>
                  }
                </div>
                <div class="flex-1 flex flex-col items-center justify-center p-3 gap-2 overflow-hidden">
                  <p class="text-xs text-gray-600 font-mono">v{version.version_number} — après</p>
                  {data.svg_b64
                    ? <img src={`data:image/svg+xml;base64,${data.svg_b64}`} alt="après" class="max-h-full max-w-full object-contain" />
                    : <p class="text-gray-600 text-xs">Pas de visuel</p>
                  }
                </div>
              </div>
            ) : (
              <div class="flex-1 flex flex-col items-center justify-center p-4 gap-3 overflow-hidden relative">
                {data.svg_b64      && <img src={`data:image/svg+xml;base64,${data.svg_b64}`}      alt="après" class="absolute inset-0 w-full h-full object-contain p-4" style={{ opacity: 1 }} />}
                {data.prev_svg_b64 && <img src={`data:image/svg+xml;base64,${data.prev_svg_b64}`} alt="avant" class="absolute inset-0 w-full h-full object-contain p-4" style={{ opacity: 1 - opacity }} />}
                <div class="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-gray-900/90 rounded-lg px-3 py-1.5">
                  <span class="text-xs text-gray-500">avant</span>
                  <input type="range" min={0} max={1} step={0.01} value={opacity}
                    onInput={e => setOpacity(parseFloat((e.target as HTMLInputElement).value))}
                    class="w-24 accent-purple-500" />
                  <span class="text-xs text-gray-500">après</span>
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

            {delta && delta.totalChanges === 0 && (
              <p class="text-xs text-gray-500 p-4">Aucune modification détectée.</p>
            )}

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
      {onBack && <button class="text-gray-500 hover:text-white text-sm" onClick={onBack}>←</button>}
      <span class="font-medium text-sm flex-1 truncate">{label}</span>
    </div>
  );
}

function Spinner({ full = false }: { full?: boolean }) {
  const inner = <div class="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />;
  return full
    ? <div class="flex items-center justify-center h-screen bg-gray-950">{inner}</div>
    : <div class="flex justify-center py-6">{inner}</div>;
}

render(h(App, null), document.body);
