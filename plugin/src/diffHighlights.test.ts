import { describe, it, expect } from 'vitest';
import { buildHighlights } from './diffHighlights';
import type { NodeDiffVisual } from './diffReducer';

const bb = { x: 0, y: 0, w: 10, h: 10 };
const nd = (over: Partial<NodeDiffVisual>): NodeDiffVisual => ({
  nodeId: 'n', nodeName: 'n', nodeType: 'RECTANGLE', changes: [],
  kind: 'modified', significance: 'notable', before_bbox: bb, after_bbox: bb, ...over,
});

describe('buildHighlights', () => {
  it('après : modified+added avec after_bbox ; removed (pas d\'after_bbox) exclu', () => {
    const h = buildHighlights([
      nd({ nodeId: 'm', kind: 'modified' }),
      nd({ nodeId: 'a', kind: 'added', before_bbox: null }),
      nd({ nodeId: 'r', kind: 'removed', after_bbox: null }),
    ], false, false);
    expect(h.map(x => `${x.nodeId}:${x.tone}`)).toEqual(['m:modified', 'a:added']);
  });

  it('avant : modified+removed avec before_bbox ; added exclu', () => {
    const h = buildHighlights([
      nd({ nodeId: 'm', kind: 'modified' }),
      nd({ nodeId: 'a', kind: 'added', before_bbox: null }),
      nd({ nodeId: 'r', kind: 'removed', after_bbox: null }),
    ], true, false);
    expect(h.map(x => `${x.nodeId}:${x.tone}`)).toEqual(['m:modified', 'r:removed']);
  });

  it('dérivés exclus par défaut, inclus (tone derived) si showDerived', () => {
    const nodes = [nd({ nodeId: 'm' }), nd({ nodeId: 'd', significance: 'minor' })];
    expect(buildHighlights(nodes, false, false).map(x => x.nodeId)).toEqual(['m']);
    const withD = buildHighlights(nodes, false, true);
    expect(withD.map(x => `${x.nodeId}:${x.tone}`)).toEqual(['m:modified', 'd:derived']);
  });
});
