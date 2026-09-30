// Page-centric : identité et résumé des frames suivies, pour naviguer frame → historique → diff.
// Logique pure, testable sans base ni Storage.
import type { FigmaSnapshot, FrameSummary, NodeSnapshot } from '../types/figma.js';

export const MAX_FRAME_RENDERS = 20; // spec page-centric §5

/** Identité d'une frame d'une version à l'autre : dg_id (survit au couper-coller), sinon id Figma. */
export function frameKey(top: NodeSnapshot): string {
  return top.dg_id || top.id;
}

/**
 * Une entrée par frame suivie de `current`. `changesByKey` : groupes modifiés par clé de frame.
 * initial = pas de version précédente, ou frame absente de la précédente (nouvellement suivie).
 */
export function summarizeFrames(
  changesByKey: ReadonlyMap<string, number>,
  current: FigmaSnapshot,
  prev: FigmaSnapshot | null,
): FrameSummary[] | undefined {
  if (current.root.type !== 'PAGE') return undefined;
  const prevKeys = new Set((prev?.root.children ?? []).map(frameKey));
  return (current.root.children ?? []).map(top => {
    const key = frameKey(top);
    const changes = changesByKey.get(key) ?? 0;
    const status = !prevKeys.has(key) ? 'initial' : changes > 0 ? 'modified' : 'unchanged';
    const ab = top.aabb;
    return {
      key, id: top.id, name: top.name,
      frame: { w: ab ? ab.w : top.width, h: ab ? ab.h : top.height },
      status, changes: status === 'modified' ? changes : 0,
    };
  });
}

/** Frames dont le plugin doit exporter un rendu : nouvelles et modifiées, dans la limite du plafond. */
export function framesToRender(frames: readonly FrameSummary[], cap = MAX_FRAME_RENDERS): Array<{ key: string; id: string }> {
  return frames.filter(f => f.status !== 'unchanged').slice(0, cap).map(({ key, id }) => ({ key, id }));
}
