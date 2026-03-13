// ─── UI THREAD — Preact + HTTP. Aucun accès API Figma ici. ───────────────────

import { render, h } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import type { MainToUI, UIToMain, FigmaSnapshot, PluginAuthor } from './types.js';
import './ui.css';

const API_BASE = 'https://design-guardian.up.railway.app';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Asset { id: string; name: string; asset_type: string }
interface Version {
  id: string; version_number: number; branch_name: string;
  status: 'draft' | 'review' | 'approved';
  ai_summary: string | null; created_at: string;
  author_name: string | null; author_avatar_url: string | null;
}
type Screen = 'loading' | 'assets' | 'home' | 'checkpoint';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function api<T>(key: string, path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { 'X-API-Key': key, 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
  });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error: string };
    throw new Error(error);
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
  const [author, setAuthor]     = useState<PluginAuthor | null>(null);
  const [asset, setAsset]       = useState<Asset | null>(null);
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
            setScreen('assets');
          } catch {
            setInitErr('Impossible de joindre le serveur.');
          }
          break;
        }
        case 'AUTHOR_INFO':    setAuthor(msg.author); break;
        case 'SNAPSHOT_READY': setSnapshot(msg.snapshot); setSvg(msg.svgBase64); setScreen('checkpoint'); break;
        case 'ERROR':          console.error('[DG]', msg.message); break;
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
    <HomeScreen apiKey={apiKey!} author={author} asset={asset!}
      branch={branch} onBranchChange={setBranch}
      onCapture={() => send({ type: 'REQUEST_SNAPSHOT' })}
      onChangeAsset={() => setScreen('assets')}
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
  apiKey: string; author: PluginAuthor | null; asset: Asset;
  branch: string; onBranchChange: (b: string) => void;
  onCapture: () => void; onChangeAsset: () => void;
}

function HomeScreen({ apiKey, author, asset, branch, onBranchChange, onCapture, onChangeAsset }: HomeProps) {
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
            {[...visible].reverse().map(v => <VersionRow key={v.id} v={v} />)}
          </div>
        )}
      </div>

      <div class="p-4 border-t border-gray-800">
        <button class="btn-primary w-full" onClick={onCapture}>Capturer un checkpoint</button>
      </div>
    </div>
  );
}

function VersionRow({ v }: { v: Version }) {
  const dot = { approved: 'bg-green-500', review: 'bg-amber-500', draft: 'bg-gray-600' }[v.status];
  return (
    <div class="flex items-start gap-3 py-3">
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
