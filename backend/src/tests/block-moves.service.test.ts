import { describe, it, expect } from 'vitest';
import { buildTreeMaps, commonAncestor, detectBlockMoves } from '../services/block-moves.service.js';
import type { NodeSnapshot, DeltaJSON, NodeDelta } from '../types/figma.js';

const node = (id: string, name: string, children: NodeSnapshot[] = []): NodeSnapshot =>
  ({ id, name, type: 'FRAME', x: 0, y: 0, width: 0, height: 0, opacity: 1, fills: [], strokes: [], children } as NodeSnapshot);

// root → [a → [a1, a2], b]
const tree = node('root', 'Root', [
  node('a', 'BlocA', [node('a1', 'A1'), node('a2', 'A2')]),
  node('b', 'BlocB'),
]);

describe('buildTreeMaps', () => {
  it('mappe parent et name', () => {
    const { parent, name } = buildTreeMaps(tree);
    expect(parent.get('root')).toBeNull();
    expect(parent.get('a')).toBe('root');
    expect(parent.get('a1')).toBe('a');
    expect(name.get('a')).toBe('BlocA');
    expect(name.get('a1')).toBe('A1');
  });
});

describe('commonAncestor', () => {
  const { parent } = buildTreeMaps(tree);
  it('deux frères → leur parent', () => {
    expect(commonAncestor(['a1', 'a2'], parent)).toBe('a');
  });
  it('un nœud + son enfant → le nœud (l\'ancêtre)', () => {
    expect(commonAncestor(['a', 'a1'], parent)).toBe('a');
  });
  it('nœuds de branches différentes → la racine commune', () => {
    expect(commonAncestor(['a1', 'b'], parent)).toBe('root');
  });
});

const moved = (id: string, dy: number): NodeDelta => ({
  nodeId: id, nodeName: id, nodeType: 'FRAME',
  changes: [{ property: 'y', oldValue: 0, newValue: dy }],
  layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED', layoutPositioning: 'AUTO', // → y minor (dérivé)
});
const mkDelta = (modified: NodeDelta[]): DeltaJSON =>
  ({ modified, added: [], removed: [], totalChanges: modified.length, metadata: { v1CapturedAt: '', v2CapturedAt: '', epsilon: 0.01, processingTimeMs: 0 } });

// arbre : parent P → [c1, c2, c3, B→[b1,b2]]
const maps = buildTreeMaps(node('P', 'Page', [
  node('c1', 'C1'), node('c2', 'C2'), node('c3', 'C3'),
  node('B', 'BlocBas', [node('b1', 'B1'), node('b2', 'B2')]),
]));

describe('detectBlockMoves', () => {
  it('3 frères décalés du même Δ → 1 bloc nommé par leur parent (>1 racine)', () => {
    const r = detectBlockMoves(mkDelta([moved('c1', -51), moved('c2', -51), moved('c3', -51)]), maps.parent, maps.name, 3);
    expect(r).toEqual([{ name: 'Page', dx: 0, dy: -51, count: 3 }]);
  });

  it('un bloc (racine unique) + ses descendants → nommé par le bloc', () => {
    const r = detectBlockMoves(mkDelta([moved('B', -51), moved('b1', -51), moved('b2', -51)]), maps.parent, maps.name, 3);
    expect(r).toEqual([{ name: 'BlocBas', dx: 0, dy: -51, count: 3 }]);
  });

  it('groupe sous le seuil → ignoré', () => {
    expect(detectBlockMoves(mkDelta([moved('c1', -51), moved('c2', -51)]), maps.parent, maps.name, 3)).toEqual([]);
  });

  it('déplacement NON dérivé (authored, hors auto-layout) → non clusterisé', () => {
    const authored: NodeDelta = { nodeId: 'c1', nodeName: 'C1', nodeType: 'FRAME', changes: [{ property: 'y', oldValue: 0, newValue: -51 }] };
    expect(detectBlockMoves(mkDelta([authored, authored, authored]), maps.parent, maps.name, 3)).toEqual([]);
  });
});
