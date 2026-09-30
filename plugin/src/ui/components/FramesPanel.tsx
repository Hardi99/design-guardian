import { useState, useEffect } from 'preact/hooks';
import type { Version } from '../../store.js';
import { frameStats } from '../../frameNav.js';
import { estimateMs, WARN_MS, type FrameEntry } from '../../trackedFrames.js';
import { timeAgo } from '../../utils.js';
import { send } from '../api.js';

function FrameIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" class="flex-shrink-0 text-dg-text-3">
      <path d="M3.5 1v10M8.5 1v10M1 3.5h10M1 8.5h10" stroke="currentColor" fill="none" />
    </svg>
  );
}

// Liste TOUTES les frames de la page : l'utilisateur doit voir ce qu'il ne suit pas, sinon
// l'omission redevient silencieuse. L'estimation du coût est affichée en continu — c'est le
// garde-fou qui l'empêche de reconstruire sans s'en rendre compte le mur mesuré au spike
// (93,8 s pour les 331 frames d'une page réelle). Une frame avec historique s'ouvre au clic.
export function FramesPanel({ versions, onOpen }: { versions: Version[]; onOpen: (f: FrameEntry) => void }) {
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
      <p class="text-[11px] text-dg-warning p-3">
        La page « {pageName} » est une page technique Design Guardian : elle n'est pas suivie.
      </p>
    );
  }

  return (
    <div class="flex flex-col py-1">
      <div class="flex items-baseline justify-between px-3 py-1.5">
        <span class="text-[11px] text-dg-text-2">{tracked.length} / {frames.length} frames suivies</span>
        <span class={`text-[10px] ${ms >= WARN_MS ? 'text-dg-warning' : 'text-dg-text-3'}`}>
          {tracked.length === 0 ? 'coche les frames à suivre' : `~${nodes} calques · ~${(ms / 1000).toFixed(1)} s`}
        </span>
      </div>

      {ms >= WARN_MS && (
        <p role="alert" class="text-[10px] text-dg-warning px-3 pb-1.5">
          Périmètre large : la capture gèlera Figma pendant l'extraction. Retire des frames pour l'accélérer.
        </p>
      )}

      {frames.length > 8 && (
        <div class="px-3 pb-1.5">
          <input type="search" value={q} placeholder="Filtrer les frames…" class="input py-1"
            onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        </div>
      )}

      {shown.map(f => {
        const stats = frameStats(versions, f.key);
        const hasHistory = stats.versions > 0;
        return (
          <label key={f.id} class="flex items-center gap-2 h-7 px-3 text-[11px] hover:bg-dg-hover cursor-pointer">
            <input type="checkbox" class="accent-dg-accent" checked={f.tracked}
              aria-label={`Suivre ${f.name}`}
              onChange={() => send({ type: 'SET_TRACKED', nodeId: f.id, tracked: !f.tracked })} />
            <FrameIcon />
            {hasHistory ? (
              <button type="button" class="flex-1 min-w-0 flex items-baseline gap-2 text-left"
                onClick={(e) => { e.preventDefault(); onOpen(f); }}>
                <span class="flex-1 truncate">{f.name}</span>
                <span class="text-[10px] text-dg-text-3 whitespace-nowrap">
                  {stats.versions} v.{stats.lastAt ? ` · ${timeAgo(stats.lastAt)}` : ''}
                </span>
              </button>
            ) : (
              <span class={`flex-1 truncate ${f.tracked ? '' : 'text-dg-text-3'}`}>{f.name}</span>
            )}
          </label>
        );
      })}
      {shown.length === 0 && <p class="text-[11px] text-dg-text-3 px-3 py-1">Aucune frame ne correspond.</p>}
    </div>
  );
}
