import { useState, useEffect } from 'preact/hooks';
import type { Version } from '../../store.js';
import { frameStats } from '../../frameNav.js';
import { estimateMs, WARN_MS, type FrameEntry } from '../../trackedFrames.js';
import { timeAgo } from '../../utils.js';
import { send } from '../api.js';

// Liste TOUTES les frames de la page : l'utilisateur doit voir ce qu'il ne suit pas, sinon
// l'omission redevient silencieuse. L'estimation du coût est affichée en continu — c'est le
// garde-fou qui l'empêche de reconstruire sans s'en rendre compte le mur mesuré au spike
// (93,8 s pour les 331 frames d'une page réelle).
// Avec `versions` + `onOpen` (page-centric) : chaque frame affiche son historique (nombre de
// versions, dernier changement) et s'ouvre au clic — seulement si elle a un historique (D6).
export function FramesPanel({ versions, onOpen }: { versions?: Version[]; onOpen?: (f: FrameEntry) => void } = {}) {
  const [frames, setFrames] = useState<FrameEntry[]>([]);
  const [pageName, setPageName] = useState('');
  const [capturable, setCapturable] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    const h = (e: MessageEvent) => {
      const m = (e.data?.pluginMessage ?? e.data) as {
        type?: string; frames?: FrameEntry[]; pageName?: string; capturable?: boolean;
      };
      if (m?.type !== 'FRAMES_LIST' || !m.frames) return;
      setFrames(m.frames);
      setPageName(m.pageName ?? '');
      setCapturable(m.capturable ?? true);
    };
    window.addEventListener('message', h);
    send({ type: 'REQUEST_FRAMES' });
    return () => window.removeEventListener('message', h);
  }, []);

  const tracked = frames.filter(f => f.tracked);
  const ms = estimateMs(frames);
  const nodes = tracked.reduce((s, f) => s + f.nodes, 0);
  const shown = q ? frames.filter(f => f.name.toLowerCase().includes(q.toLowerCase())) : frames;

  if (!capturable) {
    return (
      <p class="text-xs text-amber-400 px-1">
        La page « {pageName} » est une page technique Design Guardian : elle n'est pas suivie.
      </p>
    );
  }

  return (
    <div class="flex flex-col gap-1.5">
      <div class="flex items-baseline justify-between">
        <span class="text-xs text-gray-400">{tracked.length} / {frames.length} frames suivies</span>
        <span class={`text-[11px] ${ms >= WARN_MS ? 'text-amber-400' : 'text-gray-500'}`}>
          {tracked.length === 0 ? 'aucune' : `~${nodes} calques · ~${(ms / 1000).toFixed(1)} s`}
        </span>
      </div>

      {ms >= WARN_MS && (
        <p role="alert" class="text-[11px] text-amber-400">
          Périmètre large : la capture gèlera Figma pendant l'extraction. Retire des frames pour l'accélérer.
        </p>
      )}

      {frames.length > 8 && (
        <input
          type="search" value={q} placeholder="Filtrer les frames…"
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
          class="w-full px-2 py-1 rounded text-xs bg-gray-900 border border-gray-800 text-gray-200"
        />
      )}

      <div class={`${versions ? '' : 'max-h-40 '}overflow-auto flex flex-col`}>
        {shown.map(f => (
          <label key={f.id} class="flex items-center gap-2 px-1 py-0.5 text-xs hover:bg-gray-900 cursor-pointer">
            <input
              type="checkbox" checked={f.tracked}
              onChange={() => send({ type: 'SET_TRACKED', nodeId: f.id, tracked: !f.tracked })}
            />
            {(() => {
              const stats = versions && onOpen ? frameStats(versions, f.key) : null;
              if (stats && stats.versions > 0) {
                return (
                  <button type="button" class="flex-1 min-w-0 flex items-baseline gap-2 text-left hover:text-white"
                    onClick={(e) => { e.preventDefault(); onOpen!(f); }}>
                    <span class="flex-1 truncate text-gray-200">{f.name}</span>
                    <span class="text-[10px] text-gray-500 whitespace-nowrap">
                      {stats.versions} v.{stats.lastAt ? ` · ${timeAgo(stats.lastAt)}` : ''}
                    </span>
                  </button>
                );
              }
              return <span class={`flex-1 truncate ${f.tracked ? 'text-gray-200' : 'text-gray-500'}`}>{f.name}</span>;
            })()}
            {f.tracked && !versions && <span class="text-[10px] text-gray-600">{f.nodes}</span>}
          </label>
        ))}
        {shown.length === 0 && <p class="text-[11px] text-gray-600 px-1 py-1">Aucune frame ne correspond.</p>}
      </div>
    </div>
  );
}
