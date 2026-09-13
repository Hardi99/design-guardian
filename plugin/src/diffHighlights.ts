import type { Bbox, NodeDiffVisual } from './diffReducer';

export type Tone = 'modified' | 'added' | 'removed' | 'derived';
export interface Highlight { nodeId: string; bbox: Bbox; tone: Tone }

// Un groupe = un élément « designer » : une icône/composant (INSTANCE) et tous ses nœuds
// internes repliés ensemble, OU un nœud autonome hors instance. La boîte du groupe est
// celle de l'icône (instance_*_bbox), pas l'union des sous-vecteurs → un seul encadré/icône.
export interface DiffGroup {
  key: string;                          // instance_root (icône) ou nodeId (autonome)
  kind: 'modified' | 'added' | 'removed';
  significance: 'notable' | 'minor';    // notable si AU MOINS un membre est notable
  before_bbox: Bbox | null;
  after_bbox: Bbox | null;
  members: NodeDiffVisual[];
}

// Replie les nœuds internes d'une même icône en un seul groupe. Préserve l'ordre d'apparition
// de la première occurrence de chaque groupe. Compat : un nœud sans instance_root = groupe à 1.
export function groupDiffs(nodeDiffs: NodeDiffVisual[]): DiffGroup[] {
  const map = new Map<string, DiffGroup>();
  for (const n of nodeDiffs) {
    const key = n.instance_root ?? n.nodeId;
    const grouped = !!n.instance_root;
    let g = map.get(key);
    if (!g) {
      g = {
        key, kind: n.kind, significance: n.significance,
        before_bbox: grouped ? (n.instance_before_bbox ?? null) : n.before_bbox,
        after_bbox:  grouped ? (n.instance_after_bbox ?? null)  : n.after_bbox,
        members: [],
      };
      map.set(key, g);
    }
    g.members.push(n);
    // Le groupe est notable dès qu'un membre l'est, et adopte alors son `kind` (un vrai
    // changement prime sur un move dérivé porté).
    if (n.significance === 'notable' && g.significance !== 'notable') {
      g.significance = 'notable';
      g.kind = n.kind;
    }
  }
  return [...map.values()];
}

export function buildHighlights(nodeDiffs: NodeDiffVisual[], beforeMode: boolean, showDerived: boolean): Highlight[] {
  const out: Highlight[] = [];
  for (const g of groupDiffs(nodeDiffs)) {
    if (!showDerived && g.significance === 'minor') continue;
    const bbox = beforeMode ? g.before_bbox : g.after_bbox;
    if (!bbox) continue;
    const tone: Tone = g.significance === 'minor' ? 'derived' : g.kind;
    out.push({ nodeId: g.key, bbox, tone });
  }
  return out;
}
