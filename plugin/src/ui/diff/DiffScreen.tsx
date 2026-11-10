import { useState, useEffect, useCallback, useReducer, useRef } from 'preact/hooks';
import type { FigmaSnapshot, RestorationDelta } from '../../types.js';
import { useAppStore } from '../../useAppStore.js';
import { appStore } from '../../store.js';
import type { Version } from '../../store.js';
import { frameHistory, touchedFrames, restoreAllowedInDiff, cacheableDiff } from '../../frameNav.js';
import type { FrameSummary } from '../../frameNav.js';
import { diffReducer, initialDiffState } from '../../diffReducer.js';
import type { DiffData, DiffAction } from '../../diffReducer.js';
import { buildHighlights, groupDiffs } from '../../diffHighlights.js';
import { timeAgo } from '../../utils.js';
import { api, send } from '../api.js';
import { Spinner } from '../components/common.js';
import { HighlightCanvas } from './DiffCanvas.js';
import { NodeDetail } from './NodeDetail.js';
import { DiffChips } from './DiffChips.js';
import { IconBack, IconPrev, IconNext, IconRestore, IconCamera, IconSparkle, IconStar, IconLocate } from '../components/icons.js';

// Cache client des payloads diff (lourds, avec vignettes), par versionId. Niveau module
// pour survivre au remount de DiffScreen (key={version.id} lors de la nav ◀▶).
const diffCache = new Map<string, DiffData>();
// Vidé au rechargement de la liste des versions d'un asset (HomeScreen) : c'est le seul
// point où une navigation ◀▶ pourrait autrement servir un payload obsolète depuis le cache.
export function clearDiffCache() { diffCache.clear(); }

// Cache client des SVG fetchés (transformés), par URL. Niveau module pour survivre au
// remount de FrameImage lors de la nav ◀▶ : revenir sur une version déjà vue = rendu
// instantané, pas de re-fetch réseau.
export const svgCache = new Map<string, string>();

export function useDiffLoader(dispatch: (a: DiffAction) => void, apiKey: string, versionId: string) {
  const siblings = useAppStore(s => s.siblings);
  // Page-centric : diff d'UNE frame (rendu, changements, cadres) — la clé entre dans le cache.
  const frameKey = useAppStore(s => s.frame?.key ?? null);
  const fq = frameKey ? `frame=${encodeURIComponent(frameKey)}` : '';
  const ck = (id: string) => `${id}|${frameKey ?? ''}`;
  useEffect(() => {
    send({ type: 'RESIZE', width: 820, height: 640 });
    const cached = diffCache.get(ck(versionId));
    if (cached) {
      // Déjà prefetché (nav ◀▶ vers un voisin) : rendu immédiat, pas de round-trip réseau.
      dispatch({ type: 'LOAD_SUCCESS', data: cached });
      dispatch({ type: 'HEAVY_LOADED', data: cached });
    } else {
      api<DiffData>(apiKey, `/api/versions/versions/${versionId}${fq ? `?${fq}` : ''}`)
        .then(data => {
          dispatch({ type: 'LOAD_SUCCESS', data });
          // Vignettes par-nœud en différé (lourdes) : le changelog s'affiche tout de suite,
          // les images se remplissent ensuite. Échec silencieux (les vignettes sont optionnelles).
          api<DiffData>(apiKey, `/api/versions/versions/${versionId}?thumbs=1${fq ? `&${fq}` : ''}`)
            .then(full => { if (cacheableDiff(full)) diffCache.set(ck(versionId), full); dispatch({ type: 'HEAVY_LOADED', data: full }); })
            .catch(() => dispatch({ type: 'HEAVY_DONE' }));
        })
        .catch(e => dispatch({ type: 'LOAD_ERROR', err: (e as Error).message }));
    }
    // Prefetch en tâche de fond des 2 versions voisines (léger+thumbs) pour rendre la nav
    // ◀▶ suivante quasi instantanée. Silencieux : un échec ici ne doit pas gêner l'écran courant.
    const idx = siblings.findIndex(s => s.id === versionId);
    for (const neighbor of [siblings[idx - 1], siblings[idx + 1]]) {
      if (neighbor && !diffCache.has(ck(neighbor.id))) {
        api<DiffData>(apiKey, `/api/versions/versions/${neighbor.id}?thumbs=1${fq ? `&${fq}` : ''}`)
          .then(d => { if (cacheableDiff(d)) diffCache.set(ck(neighbor.id), d); })
          .catch(() => {});
      }
    }
  }, [apiKey, versionId, frameKey]);
}

export function buildRestoreMsg(msg: { applied?: number; skipped?: number; mode?: 'clone' | 'reapply' }): string | undefined {
  if (msg.mode === 'clone') return '✓ Restauré à l\'identique';
  if (msg.mode === 'reapply') {
    const applied = msg.applied ?? 0;
    const skipped = msg.skipped ?? 0;
    return skipped > 0
      ? `✓ ${applied} restaurés · ⚠ ${skipped} non recréés (supprimés depuis)`
      : `✓ ${applied} restaurés`;
  }
  return undefined; // legacy: le reducer construit le message depuis applied+skipped
}

export function useRestoreListener(dispatch: (a: DiffAction) => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data?.pluginMessage as { type: string; applied?: number; skipped?: number; mode?: 'clone' | 'reapply' } | undefined;
      if (!msg || msg.type !== 'RESTORE_COMPLETE') return;
      dispatch({ type: 'APPLY_COMPLETE', applied: msg.applied ?? 0, skipped: msg.skipped, restoreMsg: buildRestoreMsg(msg) });
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

export function useCycleStatus(dispatch: (a: DiffAction) => void, apiKey: string, versionId: string, status: Version['status']) {
  return useCallback(async () => {
    const next: Version['status'] = status === 'draft' ? 'review' : status === 'review' ? 'approved' : 'draft';
    dispatch({ type: 'STATUS_START' });
    try {
      await api(apiKey, `/api/versions/versions/${versionId}/status`, {
        method: 'PUT', body: JSON.stringify({ status: next }),
      });
      dispatch({ type: 'STATUS_SUCCESS', status: next });
    } catch (e) { dispatch({ type: 'STATUS_ERROR', err: (e as Error).message }); }
  }, [apiKey, versionId, status]);
}

export function useApplyToFigma(dispatch: (a: DiffAction) => void, apiKey: string, versionId: string, renderUrl: string | null, renderKind: 'svg' | 'png' | null, delta: RestorationDelta | null) {
  return useCallback(async () => {
    dispatch({ type: 'APPLY_START' });
    try {
      const { snapshot } = await api<{ snapshot: FigmaSnapshot }>(apiKey, `/api/versions/versions/${versionId}/snapshot`);
      const renderSvg = (renderKind === 'svg' && renderUrl)
        ? await fetch(renderUrl).then(r => r.text()).then(t => btoa(unescape(encodeURIComponent(t)))).catch(() => undefined)
        : undefined;
      send({ type: 'RESTORE_TO_FIGMA', versionId, snapshot, render_svg_b64: renderSvg, delta: delta ?? undefined });
    } catch (e) { dispatch({ type: 'APPLY_ERROR', err: (e as Error).message }); }
  }, [apiKey, versionId, renderUrl, renderKind, delta]);
}

const STATUS_UI = {
  approved: { label: 'Gold',   cls: 'bg-dg-success/15 text-dg-success hover:bg-dg-success/25', aria: 'Statut : Gold. Cliquer pour repasser en Draft.' },
  review:   { label: 'Review', cls: 'bg-dg-warning/15 text-dg-warning hover:bg-dg-warning/25', aria: 'Statut : Review. Cliquer pour passer en Gold.' },
  draft:    { label: 'Draft',  cls: 'bg-dg-raised text-dg-text-2 border border-dg-border hover:bg-dg-hover hover:text-dg-text', aria: 'Statut : Draft. Cliquer pour soumettre en Review.' },
} as const;

export function DiffScreen() {
  const apiKey    = useAppStore(s => s.apiKey)!;
  const version   = useAppStore(s => s.diffVersion)!;
  const setScreen = useAppStore(s => s.setScreen);
  const siblings       = useAppStore(s => s.siblings);
  const setDiffVersion = useAppStore(s => s.setDiffVersion);
  const frame          = useAppStore(s => s.frame);
  const setFrame       = useAppStore(s => s.setFrame);
  const setSiblings    = useAppStore(s => s.setSiblings);

  const [state, dispatch] = useReducer(diffReducer, version.status, initialDiffState);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [beforeMode, setBeforeMode] = useState(false);
  const [showMinor, setShowMinor] = useState(false); // changements dérivés (move porté/auto-layout) repliés

  // Navigation ◀▶ entre versions de la branche (siblings ordonnés ancien→récent).
  // Le remount par key={version.id} côté App réinitialise le reducer/loader à chaque saut.
  const navIdx = siblings.findIndex(s => s.id === version.id);
  const prevV  = navIdx > 0 ? siblings[navIdx - 1] : null;
  const nextV  = navIdx >= 0 && navIdx < siblings.length - 1 ? siblings[navIdx + 1] : null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return; // ne pas voler les flèches dans les inputs
      if (e.key === 'ArrowLeft' && prevV) setDiffVersion(prevV);
      else if (e.key === 'ArrowRight' && nextV) setDiffVersion(nextV);
      else if (e.key === 'Escape') dispatch({ type: 'CANCEL_RESTORE' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prevV, nextV]);

  useDiffLoader(dispatch, apiKey, version.id);
  useRestoreListener(dispatch);
  const cycleStatus  = useCycleStatus(dispatch, apiKey, version.id, state.status);
  const applyToFigma = useApplyToFigma(dispatch, apiKey, version.id, state.data?.render_url ?? null, state.data?.render_kind ?? null, (state.data?.version.analysis_json ?? null) as RestorationDelta | null);

  // Retour à l'historique de la frame si on vient de là, sinon à l'accueil.
  const goBack = useCallback(() => { send({ type: 'RESIZE', width: 400, height: 600 }); setScreen(appStore.getState().frame ? 'frameHistory' : 'home'); }, []);

  const { data, loading, err, status, statusBusy, confirmingRestore, applyingToFigma, restoreMsg, heavyDone } = state;
  const hasPrev = !!data?.prev_version;
  // Page-centric : frames touchées par cette version (vide hors page ou versions sans résumé).
  const pageFrames = touchedFrames((data?.version.analysis_json as { frames?: FrameSummary[] } | null)?.frames);
  const nodeDiffs = data?.node_diffs ?? [];
  const highlights = buildHighlights(nodeDiffs, beforeMode, showMinor);
  // Compteur PAR GROUPE : les nœuds internes d'une icône comptent pour 1 (pas 1 par vecteur).
  const groups = groupDiffs(nodeDiffs);
  // Sélection : un highlight porte la clé de groupe (icône) → on retrouve un membre représentatif.
  const selected = nodeDiffs.find(n => (n.instance_root ?? n.nodeId) === selectedId) ?? null;
  const counts = {
    modified: groups.filter(g => g.kind === 'modified' && g.significance !== 'minor').length,
    added:    groups.filter(g => g.kind === 'added').length,
    removed:  groups.filter(g => g.kind === 'removed').length,
    derived:  groups.filter(g => g.significance === 'minor').length,
  };
  const canvasUrl    = beforeMode ? data?.prev_render_url    : data?.render_url;
  const canvasKind   = beforeMode ? data?.prev_render_kind   : data?.render_kind;
  const canvasFrame  = beforeMode ? data?.prev_frame         : data?.current_frame;
  const canvasSource = beforeMode ? data?.prev_render_source : data?.render_source;
  const st = STATUS_UI[status];
  const canRestore = !!data && restoreAllowedInDiff(frame);

  return (
    <div class="flex flex-col h-screen bg-dg-bg text-dg-text">
      <div class="flex items-center gap-1 px-2.5 h-12 border-b border-dg-border flex-shrink-0">
        <button aria-label="Retour" class="icon-btn" onClick={goBack}><IconBack /></button>
        <div class="flex items-center gap-0.5 flex-1 min-w-0 justify-center">
          <button aria-label="Version précédente" title="Version précédente (←)" disabled={!prevV}
            class="icon-btn" onClick={() => prevV && setDiffVersion(prevV)}><IconPrev /></button>
          <span class="text-[13px] font-semibold truncate px-1">
            v{version.version_number}{frame && <span class="font-normal text-dg-text-2"> · {frame.name}</span>}
          </span>
          <button aria-label="Version suivante" title="Version suivante (→)" disabled={!nextV}
            class="icon-btn" onClick={() => nextV && setDiffVersion(nextV)}><IconNext /></button>
        </div>
        {frame && (
          <button class="icon-btn flex-shrink-0" aria-label="Voir sur le canvas" title="Voir sur le canvas"
            onClick={() => send({ type: 'SHOW_ON_CANVAS', key: frame.key })}><IconLocate /></button>
        )}
        {/* Statut + explication (visible au survol ET au focus clavier) */}
        <div class="relative group flex-shrink-0">
          <button onClick={cycleStatus} disabled={statusBusy} aria-label={st.aria} aria-describedby="status-help"
            class={`chip py-1 transition-colors ${st.cls}`}>
            {status === 'approved' && <IconStar />}{st.label}
          </button>
          <div id="status-help" role="tooltip" class="hidden group-hover:block group-focus-within:block absolute top-full right-0 mt-1.5 z-50 w-56 p-2.5 bg-dg-raised border border-dg-border rounded-dg shadow-xl text-left">
            <p class="text-[12px] font-semibold text-dg-text mb-1">Cycle de validation</p>
            <p class="text-[11px] leading-relaxed text-dg-text-2">
              Draft (brouillon) → <span class="text-dg-warning">Review</span> (en relecture) → <span class="text-dg-success">Gold</span> (version approuvée, référence de l'équipe).
            </p>
            <p class="text-[11px] text-dg-text-2 mt-1">Cliquer pour changer de statut.</p>
          </div>
        </div>
        {/* Une seule action de restauration : elle réécrit le canvas, donc elle se confirme.
            Absente du diff d'une frame : réappliquerait toute la page (Phase 4). */}
        {canRestore && !confirmingRestore && (
          <button onClick={() => dispatch({ type: 'ASK_RESTORE' })} disabled={applyingToFigma}
            class="btn-primary py-1 px-3 flex items-center gap-1.5 flex-shrink-0"
            aria-label="Restaurer cette version sur le canvas Figma">
            <IconRestore /> {applyingToFigma ? 'Restauration…' : 'Restaurer'}
          </button>
        )}
      </div>

      {canRestore && confirmingRestore && (
        <div role="alertdialog" aria-labelledby="restore-q" class="px-3 py-2.5 border-b border-dg-border bg-dg-accent-soft flex items-center gap-2 flex-shrink-0">
          <p id="restore-q" class="flex-1 text-[12px] leading-snug">
            Remplacer le canvas par la <strong>v{version.version_number}</strong> ? Les versions suivantes restent dans l'historique.
          </p>
          <button class="btn-secondary py-1 px-3" onClick={() => dispatch({ type: 'CANCEL_RESTORE' })}>Annuler</button>
          <button class="btn-primary py-1 px-3" autoFocus onClick={applyToFigma}>Restaurer</button>
        </div>
      )}

      {version.ai_summary && (
        <div class="px-3 py-2.5 border-b border-dg-border flex-shrink-0 bg-dg-accent-soft flex gap-2">
          <span class="text-dg-accent-text mt-0.5"><IconSparkle /></span>
          <p class="text-[13px] leading-snug">{version.ai_summary}</p>
        </div>
      )}
      {restoreMsg && <div role="status" class="px-3 py-2 bg-dg-success/10 border-b border-dg-success/40 text-dg-success text-[12px] flex-shrink-0">{restoreMsg}</div>}
      {loading && <Spinner full />}
      {err     && <p role="alert" class="text-dg-danger text-[12px] p-4">{err}</p>}

      {/* Version de page ouverte depuis « Toutes les versions » : pas de rendu global, on
          choisit une frame touchée (son diff, et son historique pour la nav ◀▶). */}
      {data && !frame && pageFrames.length > 0 && (
        <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
          <p class="text-[12px] text-dg-text-2">Frames modifiées dans cette version :</p>
          {pageFrames.map(f => (
            <button key={f.key} class="text-left px-3.5 py-3 bg-dg-raised hover:bg-dg-hover border border-dg-border rounded-dg text-[13px] flex items-center gap-2 transition-colors"
              onClick={() => { setFrame({ key: f.key, name: f.name }); setSiblings(frameHistory(siblings, f.key)); }}>
              <span class="flex-1 truncate">{f.name}</span>
              <span class="text-[11px] text-dg-text-2">{f.status === 'initial' ? 'nouvelle' : `${f.changes} changement(s)`}</span>
              <span class="text-dg-text-3"><IconNext /></span>
            </button>
          ))}
        </div>
      )}

      {data && (frame || pageFrames.length === 0) && (
        hasPrev ? (
          <div class="flex flex-1 overflow-hidden">
            <div class="flex-1 flex flex-col border-r border-dg-border overflow-hidden relative">
              <DiffChips counts={counts} beforeMode={beforeMode} showDerived={showMinor} approximate={canvasSource === 'reconstruction'}
                onToggleBefore={() => { setBeforeMode(v => !v); setSelectedId(null); }} onToggleDerived={() => setShowMinor(v => !v)} />
              {canvasUrl && canvasKind && canvasFrame
                ? <HighlightCanvas url={canvasUrl} kind={canvasKind} frame={canvasFrame}
                    highlights={highlights} selectedId={selectedId} onSelect={setSelectedId} />
                : <div class="flex-1 flex items-center justify-center">
                    <p class="text-dg-text-2 text-[12px]">{heavyDone ? 'Rendu indisponible.' : 'Chargement du rendu…'}</p>
                  </div>}
            </div>
            <div class="w-72 flex flex-col overflow-hidden">
              <NodeDetail node={selected} renderUrl={data.render_url} prevRenderUrl={data.prev_render_url}
                currentFrame={data.current_frame} prevFrame={data.prev_frame} />
            </div>
          </div>
        ) : data.render_url && data.render_kind && data.current_frame ? (
          // v1 : pas de diff (aucun parent), mais on montre le rendu de la version
          // initiale — le jury voit la baseline avant le restore, plus de "preview vide".
          <div class="flex flex-1 flex-col overflow-hidden relative">
            <div class="px-3 py-2 text-[12px] text-dg-text-2 border-b border-dg-border flex items-center gap-1.5 flex-shrink-0">
              <IconCamera /><span>Version initiale — le comparatif démarre à la v2</span>
            </div>
            <HighlightCanvas url={data.render_url} kind={data.render_kind} frame={data.current_frame}
              highlights={[]} selectedId={null} onSelect={() => {}} />
          </div>
        ) : (
          <div class="flex-1 flex flex-col items-center justify-center gap-5 p-8 text-center">
            <div class="w-14 h-14 rounded-full bg-dg-accent-soft border border-dg-accent-line text-dg-accent-text flex items-center justify-center">
              <IconCamera size={24} />
            </div>
            <div class="flex flex-col gap-1">
              <p class="text-[14px] font-semibold text-dg-text">Checkpoint initial</p>
              <p class="text-[12px] text-dg-text-2">{heavyDone ? 'Le diff visuel apparaîtra à partir de la v2' : 'Chargement du rendu…'}</p>
            </div>
            <p class="text-[12px] text-dg-text-2">
              {timeAgo(version.created_at)}{version.author_name && ` · par ${version.author_name}`}
            </p>
          </div>
        )
      )}
    </div>
  );
}
