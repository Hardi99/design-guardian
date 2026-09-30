import { useState, useEffect, useCallback } from 'preact/hooks';
import { useAppStore } from '../../useAppStore.js';
import { pollPatchNote } from '../../patchNote.js';
import { awaitCheckpointSummary } from '../../realtime.js';
import { api, send } from '../api.js';
import { Spinner, Topbar } from '../components/common.js';

export function CheckpointScreen() {
  const apiKey       = useAppStore(s => s.apiKey)!;
  const author       = useAppStore(s => s.author)!;
  const asset        = useAppStore(s => s.asset)!;
  const branch       = useAppStore(s => s.branch);
  const snapshot     = useAppStore(s => s.snapshot)!;
  const renderSvgB64 = useAppStore(s => s.renderSvgB64);
  const renderKind   = useAppStore(s => s.renderKind);
  const setScreen    = useAppStore(s => s.setScreen);

  const [branchName, setBranchName] = useState(branch);
  const [loading,    setLoading]    = useState(false);
  const [saved,      setSaved]      = useState<{ summary: string | null; changes: number; versionId: string } | null>(null);
  const [err,        setErr]        = useState<string | null>(null);

  const [patchNote,    setPatchNote]    = useState<string | null>(null);
  const [patchState,   setPatchState]   = useState<'idle' | 'pending' | 'timeout'>('idle');
  const [regenerating, setRegenerating] = useState(false);

  const save = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      // Le rendu (image) ne voyage PLUS dans ce POST : il est poussé juste après, hors du
      // chemin critique, pour que "Checkpoint sauvegardé" s'affiche sans attendre son upload.
      const data = await api<{ version: { id: string; version_number: number }; ai_summary: string | null; analysis: { totalChanges?: number } | null; render_frames?: Array<{ key: string; id: string }> }>(
        apiKey, '/api/checkpoints', {
          method: 'POST',
          body: JSON.stringify({
            asset_id:        asset.id,
            branch_name:     branchName.trim() || 'main',
            figma_node_id:   snapshot.figmaNodeId,
            snapshot_json:   snapshot,
            author: { figma_id: author.figma_id, name: author.name, avatar_url: author.avatar_url },
          }),
        }
      );
      // Finalise le clone d'historique (capturé en pending au snapshot) → restore lossless.
      send({ type: 'STORE_HISTORY_CLONE', nodeId: snapshot.figmaNodeId, versionId: data.version.id, versionNumber: data.version.version_number });
      // Page-centric : rendus des frames nouvelles/modifiées (le serveur dit lesquelles).
      if (data.render_frames?.length) send({ type: 'RENDER_FRAMES', versionId: data.version.id, frames: data.render_frames });
      setSaved({ summary: data.ai_summary, changes: data.analysis?.totalChanges ?? 0, versionId: data.version.id });
      // Upload différé du rendu (best-effort, non bloquant) : si ça échoue, le viewer
      // retombe sur la reconstruction — aucune conséquence sur la validité du checkpoint.
      if (renderSvgB64) {
        void api(apiKey, `/api/checkpoints/${data.version.id}/render`, {
          method: 'POST',
          body: JSON.stringify({ render_svg_b64: renderSvgB64, render_kind: renderKind ?? 'svg' }),
        }).catch(() => { /* best-effort */ });
      }
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [apiKey, asset.id, branchName, snapshot, author, renderSvgB64, renderKind]);

  // Récupération du AI Patch Note (généré en arrière-plan côté serveur).
  // Primaire : PUSH via Realtime (le backend broadcaste dès le résumé prêt).
  // Filet : polling (couvre la panne WS ET la course « broadcast émis avant l'abonnement »).
  useEffect(() => {
    if (!saved) return;
    if (saved.summary) { setPatchNote(saved.summary); setPatchState('idle'); return; }
    if (saved.changes <= 0) { setPatchState('idle'); return; } // 0 changement : pas de génération
    setPatchState('pending');
    let cancelled = false;
    (async () => {
      let summary = await awaitCheckpointSummary(saved.versionId, 10000);
      if (!summary && !cancelled) {
        summary = await pollPatchNote(
          () => api<{ version: { ai_summary: string | null } }>(apiKey, `/api/checkpoints/${saved.versionId}`)
                  .then((d) => ({ ai_summary: d.version.ai_summary })),
          { intervalMs: 2000, maxTries: 4 },
        );
      }
      if (cancelled) return;
      if (summary) { setPatchNote(summary); setPatchState('idle'); }
      else setPatchState('timeout');
    })();
    return () => { cancelled = true; };
  }, [saved, apiKey]);

  const regenerate = useCallback(async () => {
    if (!saved) return;
    setRegenerating(true);
    try {
      const d = await api<{ version: { ai_summary: string | null } }>(
        apiKey, `/api/checkpoints/${saved.versionId}/regenerate`, { method: 'POST' });
      if (d.version.ai_summary) { setPatchNote(d.version.ai_summary); setPatchState('idle'); }
      else setPatchState('timeout');
    } catch { setPatchState('timeout'); }
    finally { setRegenerating(false); }
  }, [apiKey, saved]);

  if (saved) return (
    <div class="flex flex-col h-screen bg-gray-950 text-white p-6">
      <div class="flex-1 flex flex-col justify-center gap-4">
        <p class="text-green-400 font-semibold">✦ Checkpoint sauvegardé</p>
        <div class="p-4 bg-gray-900 rounded-lg border border-gray-800 flex flex-col gap-1.5">
          <p class="text-xs text-gray-500 font-mono">{branchName}</p>
          {patchNote ? (
            <p class="text-sm text-gray-200 leading-relaxed">{patchNote}</p>
          ) : saved.changes <= 0 ? (
            <p class="text-sm text-gray-200 leading-relaxed">Aucune modification détectée.</p>
          ) : patchState === 'pending' ? (
            <p class="text-sm text-gray-400 leading-relaxed flex items-center gap-2"><Spinner /> Patch Note en cours…</p>
          ) : (
            <div class="flex flex-col gap-2">
              <p class="text-sm text-gray-400">Patch Note indisponible.</p>
              <button class="btn-secondary text-xs" onClick={regenerate} disabled={regenerating}>
                {regenerating ? 'Régénération…' : 'Régénérer'}
              </button>
            </div>
          )}
          {saved.changes > 0 && <p class="text-xs text-purple-400">{saved.changes} modification(s)</p>}
        </div>
      </div>
      <button class="btn-secondary w-full" onClick={() => setScreen('home')}>← Retour à la timeline</button>
    </div>
  );

  // Feedback franc pendant la capture : un écran plein plutôt qu'un simple libellé de bouton,
  // pour que le clic ait un effet visible immédiat (la latence perçue chutait sans ça).
  if (loading) return (
    <div class="flex flex-col h-screen bg-gray-950 text-white items-center justify-center gap-4">
      <Spinner />
      <p class="text-sm text-gray-300">Capture en cours…</p>
      <p class="text-xs text-gray-600">{snapshot.figmaNodeName}</p>
    </div>
  );

  return (
    <div class="flex flex-col h-screen bg-gray-950 text-white">
      <Topbar label="Nouveau checkpoint" onBack={() => setScreen('home')} />
      <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <div class="p-3 bg-gray-900 rounded-lg border border-gray-800">
          <p class="text-xs text-gray-500 mb-0.5">Élément sélectionné</p>
          <p class="text-sm font-medium">{snapshot.figmaNodeName}</p>
        </div>
        <div>
          <label htmlFor="cp-branch" class="text-xs text-gray-500 uppercase tracking-wide">Branche</label>
          <input id="cp-branch" class="input mt-1" placeholder="main" value={branchName} onInput={e => setBranchName((e.target as HTMLInputElement).value)} />
        </div>
        {err && <p role="alert" class="text-red-400 text-xs">{err}</p>}
      </div>
      <div class="p-4 border-t border-gray-800">
        <button class="btn-primary w-full" onClick={save}>Save Checkpoint</button>
      </div>
    </div>
  );
}
