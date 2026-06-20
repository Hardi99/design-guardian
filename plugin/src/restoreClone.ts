// Logique PURE de sélection des clones d'historique (testable sans Figma).

export interface HistoryFrameInfo {
  id: string;             // id Figma du frame-clone
  versionId?: string;     // dg_history_version
  assetId?: string;       // dg_history_asset (groupage)
  versionNumber?: number; // dg_history_vnum (tri d'élagage)
}

/** id du clone correspondant au checkpoint `versionId`, ou undefined. */
export function pickHistoryClone(frames: HistoryFrameInfo[], versionId: string): string | undefined {
  return frames.find(f => f.versionId === versionId)?.id;
}

/**
 * Ids des clones à SUPPRIMER : ceux de `assetId` au-delà des `keepN` plus récents.
 * Ne considère que les frames FINALISÉES (versionNumber défini) ; tri vnum décroissant.
 */
export function framesToPrune(frames: HistoryFrameInfo[], assetId: string, keepN: number): string[] {
  return frames
    .filter(f => f.assetId === assetId && f.versionNumber !== undefined)
    .sort((a, b) => (b.versionNumber! - a.versionNumber!))
    .slice(keepN)
    .map(f => f.id);
}
