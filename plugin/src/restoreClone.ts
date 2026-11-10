// Logique PURE des copies d'historique (page dg/_history), testable sans Figma.
//
// Une copie fige l'état exact d'UNE frame. Elle n'est créée que quand la frame a changé
// depuis sa dernière copie (empreinte du snapshot) ; sinon la dernière copie « couvre »
// aussi la nouvelle version. Restaurer la vN = remettre, pour chaque frame, la copie qui
// couvre la vN : à l'identique, éléments supprimés compris.

export interface HistoryFrameInfo {
  id: string;             // id Figma de la copie
  key: string;            // frame copiée (dg_id, sinon id) — dg_history_asset
  versionIds: string[];   // versions couvertes (vide = en attente de sauvegarde)
  versionNumber?: number; // version de création (tri du nettoyage)
  hash?: string;          // empreinte du snapshot de la frame au moment de la copie
  gold: string[];         // versions Gold couvertes : copie jamais supprimée
}

/** Empreinte FNV-1a du snapshot : détecte qu'une frame a changé entre deux captures. */
export function hashSnapshot(snap: unknown): string {
  const s = JSON.stringify(snap);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36) + s.length.toString(36);
}

const done = (f: HistoryFrameInfo) => f.versionNumber !== undefined;

/** Copie validée la plus récente d'une frame : la référence pour savoir si elle a changé. */
export function latestCopy(frames: HistoryFrameInfo[], key: string): HistoryFrameInfo | undefined {
  return frames.filter(f => f.key === key && done(f)).sort((a, b) => b.versionNumber! - a.versionNumber!)[0];
}

/** id de la copie qui couvre `versionId` (d'une frame donnée si `key`), ou undefined. */
export function pickHistoryClone(frames: HistoryFrameInfo[], versionId: string, key?: string): string | undefined {
  return frames.find(f => (key === undefined || f.key === key) && f.versionIds.includes(versionId))?.id;
}

/** Copies à SUPPRIMER pour une frame : au-delà des `keepN` plus récentes, sauf celles qui couvrent une version Gold. */
export function framesToPrune(frames: HistoryFrameInfo[], key: string, keepN: number): string[] {
  return frames
    .filter(f => f.key === key && done(f))
    .sort((a, b) => b.versionNumber! - a.versionNumber!)
    .slice(keepN)
    .filter(f => f.gold.length === 0)
    .map(f => f.id);
}

type FrameSnap = { id: string; dg_id?: string };
export type RestoreStep<T, S extends FrameSnap> =
  | { kind: 'copy'; copyId: string; live: T | undefined; snap: S } // à l'identique (la frame revient si supprimée)
  | { kind: 'reapply'; live: T; snap: S }                          // secours : valeurs réappliquées
  | { kind: 'missing'; snap: S };                                  // ni copie ni frame

/** Pour chaque frame de la version : copie si elle existe, sinon secours, sinon introuvable.
 *  Les frames créées après la version ne sont pas listées : restaurer ne supprime jamais rien. */
export function planPageRestore<T, S extends FrameSnap>(
  frames: readonly S[], copies: HistoryFrameInfo[], versionId: string, live: Map<string, T>,
): Array<RestoreStep<T, S>> {
  return frames.map(snap => {
    const key = snap.dg_id || snap.id;
    const copyId = pickHistoryClone(copies, versionId, key);
    const node = live.get(key);
    if (copyId) return { kind: 'copy', copyId, live: node, snap };
    return node !== undefined ? { kind: 'reapply', live: node, snap } : { kind: 'missing', snap };
  });
}

/** Message de fin de restauration : ce qui est exact, partiel, introuvable. */
export function restoreSummary({ exact, partial, missing }: { exact: number; partial: number; missing: number }): string {
  const s = (n: number) => (n > 1 ? 's' : '');
  if (!exact && partial) return `✓ ${partial} frame${s(partial)} restaurée${s(partial)} partiellement (copie trop ancienne)`
    + (missing ? ` · ${missing} introuvable${s(missing)}` : '');
  const parts = [`✓ ${exact} frame${s(exact)} restaurée${s(exact)} à l’identique`];
  if (partial) parts.push(`${partial} partiellement (copie trop ancienne)`);
  if (missing) parts.push(`${missing} introuvable${s(missing)}`);
  return parts.join(' · ');
}
