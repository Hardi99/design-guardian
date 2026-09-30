import { useState, useEffect, useCallback, useReducer, useRef } from 'preact/hooks';
import type { FigmaSnapshot, PluginAuthor, RestorationDelta } from '../../types.js';
import { useAppStore } from '../../useAppStore.js';
import { appStore } from '../../store.js';
import type { Version, Screen } from '../../store.js';
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

export function useRestore(
  dispatch: (a: DiffAction) => void, apiKey: string, versionId: string,
  author: PluginAuthor | null, branch: string, setScreen: (s: Screen) => void,
) {
  return useCallback(async () => {
    if (!author) return;
    dispatch({ type: 'RESTORE_START' });
    try {
      await api(apiKey, `/api/versions/versions/${versionId}/restore`, {
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

export function DiffScreen() {
  const apiKey    = useAppStore(s => s.apiKey)!;
  const version   = useAppStore(s => s.diffVersion)!;
  const author    = useAppStore(s => s.author);
  const branch    = useAppStore(s => s.branch);
  const setScreen = useAppStore(s => s.setScreen);
  const siblings       = useAppStore(s => s.siblings);
  const setDiffVersion = useAppStore(s => s.setDiffVersion);
  const frame          = useAppStore(s => s.frame);
  const setFrame       = useAppStore(s => s.setFrame);
  const setSiblings    = useAppStore(s => s.setSiblings);

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
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prevV, nextV]);

  const [state, dispatch] = useReducer(diffReducer, version.status, initialDiffState);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [beforeMode, setBeforeMode] = useState(false);
  const [showMinor, setShowMinor] = useState(false); // changements dérivés (move porté/auto-layout) repliés

  useDiffLoader(dispatch, apiKey, version.id);
  useRestoreListener(dispatch);
  const cycleStatus  = useCycleStatus(dispatch, apiKey, version.id, state.status);
  const applyToFigma = useApplyToFigma(dispatch, apiKey, version.id, state.data?.render_url ?? null, state.data?.render_kind ?? null, (state.data?.version.analysis_json ?? null) as RestorationDelta | null);
  const restore      = useRestore(dispatch, apiKey, version.id, author, branch, setScreen);

  // Retour à l'historique de la frame si on vient de là, sinon à l'accueil.
  const goBack = useCallback(() => { send({ type: 'RESIZE', width: 400, height: 600 }); setScreen(appStore.getState().frame ? 'frameHistory' : 'home'); }, []);

  const { data, loading, err, status, statusBusy, restoring, applyingToFigma, restoreMsg, heavyDone } = state;
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

  return (
    <div class="flex flex-col h-screen bg-gray-950 text-white">
      {/* Header */}
      <div class="flex items-center gap-2 px-4 py-3 border-b border-gray-800 flex-shrink-0">
        <button aria-label="Retour à la timeline" class="text-gray-500 hover:text-white text-sm flex-shrink-0" onClick={goBack}>←</button>
        <button aria-label="Version précédente" title="Version précédente (←)" disabled={!prevV}
          class="text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-default text-sm flex-shrink-0"
          onClick={() => prevV && setDiffVersion(prevV)}>◀</button>
        <span class="font-medium text-sm flex-1 truncate text-center">
          v{version.version_number}
          <span class="text-gray-500 font-normal"> · {version.branch_name}</span>
        </span>
        <button aria-label="Version suivante" title="Version suivante (→)" disabled={!nextV}
          class="text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-default text-sm flex-shrink-0"
          onClick={() => nextV && setDiffVersion(nextV)}>▶</button>
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
        {/* Restore checkpoint — pas sur le diff d'une frame : réappliquerait toute la page (Phase 4) */}
        {data && restoreAllowedInDiff(frame) && (
          <button onClick={restore} disabled={restoring}
            class="px-2 py-1 rounded text-xs bg-gray-800 text-gray-400 hover:bg-gray-700 flex-shrink-0 transition-colors"
            aria-label="Créer un checkpoint depuis cette version">
            {restoring ? '…' : '↩ Checkpoint'}
          </button>
        )}
        {/* Apply to Figma canvas */}
        {data && restoreAllowedInDiff(frame) && (
          <button onClick={applyToFigma} disabled={applyingToFigma}
            class="px-2 py-1 rounded text-xs bg-purple-700 text-purple-200 hover:bg-purple-600 flex-shrink-0 transition-colors"
            aria-label="Restaurer cette version sur le canvas Figma">
            {applyingToFigma ? '…' : '↩ Restore'}
          </button>
        )}
      </div>

      {version.ai_summary && (
        <div class="px-4 py-2 border-b border-gray-800 flex-shrink-0">
          <p class="text-xs text-gray-300 leading-relaxed">{version.ai_summary}</p>
        </div>
      )}
      {restoreMsg && <div role="status" class="px-4 py-2 bg-green-900/40 border-b border-green-800 text-green-400 text-xs flex-shrink-0">{restoreMsg}</div>}
      {loading && <Spinner full />}
      {err     && <p role="alert" class="text-red-400 text-xs p-4">{err}</p>}

      {/* Version de page ouverte depuis « Toutes les versions » : pas de rendu global, on
          choisit une frame touchée (son diff, et son historique pour la nav ◀▶). */}
      {data && !frame && pageFrames.length > 0 && (
        <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
          <p class="text-xs text-gray-400">Frames modifiées dans cette version :</p>
          {pageFrames.map(f => (
            <button key={f.key} class="text-left p-3 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-lg text-sm"
              onClick={() => { setFrame({ key: f.key, name: f.name }); setSiblings(frameHistory(siblings, f.key)); }}>
              {f.name}
              <span class="text-xs text-gray-500 ml-2">{f.status === 'initial' ? 'nouvelle' : `${f.changes} changement(s)`}</span>
            </button>
          ))}
        </div>
      )}

      {data && (frame || pageFrames.length === 0) && (
        hasPrev ? (
          <div class="flex flex-1 overflow-hidden">
            <div class="flex-1 flex flex-col border-r border-gray-800 overflow-hidden relative">
              <DiffChips counts={counts} beforeMode={beforeMode} showDerived={showMinor} approximate={canvasSource === 'reconstruction'}
                onToggleBefore={() => { setBeforeMode(v => !v); setSelectedId(null); }} onToggleDerived={() => setShowMinor(v => !v)} />
              {canvasUrl && canvasKind && canvasFrame
                ? <HighlightCanvas url={canvasUrl} kind={canvasKind} frame={canvasFrame}
                    highlights={highlights} selectedId={selectedId} onSelect={setSelectedId} />
                : <div class="flex-1 flex items-center justify-center">
                    <p class="text-gray-600 text-xs">{heavyDone ? 'Rendu indisponible.' : 'Chargement du rendu…'}</p>
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
            <div class="px-3 py-1.5 text-[11px] text-gray-500 border-b border-gray-800 flex items-center gap-1.5 flex-shrink-0">
              <span>📸</span><span>Version initiale — le comparatif démarre à la v2</span>
            </div>
            <HighlightCanvas url={data.render_url} kind={data.render_kind} frame={data.current_frame}
              highlights={[]} selectedId={null} onSelect={() => {}} />
          </div>
        ) : (
          <div class="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center">
            <div class="w-14 h-14 rounded-2xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center">
              <span class="text-2xl">📸</span>
            </div>
            <div class="flex flex-col gap-1">
              <p class="text-sm font-medium text-gray-200">Checkpoint initial</p>
              <p class="text-xs text-gray-500">{heavyDone ? 'Le diff visuel apparaîtra à partir de la v2' : 'Chargement du rendu…'}</p>
            </div>
            <div class="flex flex-col gap-1.5 text-xs text-gray-600">
              <span>{timeAgo(version.created_at)}</span>
              {version.author_name && <span>par {version.author_name}</span>}
            </div>
          </div>
        )
      )}
    </div>
  );
}
