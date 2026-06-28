import type { Bbox, NodeDiffVisual } from './diffReducer';

export type Tone = 'modified' | 'added' | 'removed' | 'derived';
export interface Highlight { nodeId: string; bbox: Bbox; tone: Tone }

export function buildHighlights(nodeDiffs: NodeDiffVisual[], beforeMode: boolean, showDerived: boolean): Highlight[] {
  const pool = showDerived ? nodeDiffs : nodeDiffs.filter(n => n.significance !== 'minor');
  const out: Highlight[] = [];
  for (const n of pool) {
    const bbox = beforeMode ? n.before_bbox : n.after_bbox;
    if (!bbox) continue;
    const tone: Tone = n.significance === 'minor' ? 'derived' : n.kind;
    out.push({ nodeId: n.nodeId, bbox, tone });
  }
  return out;
}
