// Navigation page-centric : liste des frames → historique d'une frame → diff. Pur, testable.
import type { Version } from './store.js';

/** Résumé d'une frame suivie à une version (miroir de FrameSummary côté serveur). */
export interface FrameSummary {
  key: string; // identité stable : dg_id, sinon id Figma
  id: string;
  name: string;
  frame: { w: number; h: number };
  status: 'initial' | 'modified' | 'unchanged';
  changes: number;
}

/** Versions où la frame est apparue (initial) ou a changé (modified), en ordre chronologique. */
export function frameHistory(versions: readonly Version[], key: string): Version[] {
  return versions
    .filter(v => v.frames?.some(f => f.key === key && f.status !== 'unchanged'))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function frameStats(versions: readonly Version[], key: string): { versions: number; lastAt: string | null } {
  const h = frameHistory(versions, key);
  return { versions: h.length, lastAt: h.length > 0 ? h[h.length - 1].created_at : null };
}

/** La navigation par frame n'a de sens que si au moins une version porte un résumé de frames. */
export function hasFrameNav(versions: readonly Version[]): boolean {
  return versions.some(v => (v.frames?.length ?? 0) > 0);
}

/** Frames touchées à une version (nouvelles ou modifiées) : entrées du diff « toutes versions ». */
export function touchedFrames(frames: readonly FrameSummary[] | null | undefined): FrameSummary[] {
  return (frames ?? []).filter(f => f.status !== 'unchanged');
}

/**
 * Diff d'UNE frame : « Restore » / « ↩ Checkpoint » réappliqueraient toute la page — la
 * restauration par frame relève de la Phase 4. Permis seulement hors sélection de frame.
 */
export function restoreAllowedInDiff(frame: { key: string; name: string } | null): boolean {
  return frame === null;
}

/**
 * Juste après une capture, les rendus de frame sont encore en cours d'envoi : une réponse sans
 * rendu n'est pas mise en cache (sinon « Rendu indisponible. » pour toute la session).
 */
export function cacheableDiff(data: { render_url: string | null }): boolean {
  return data.render_url !== null;
}
