import { describe, it, expect } from 'vitest';
import { buildHighlights, groupDiffs } from './diffHighlights';
import type { NodeDiffVisual } from './diffReducer';

const bb = { x: 0, y: 0, w: 10, h: 10 };
const iconBb = { x: 0, y: 0, w: 40, h: 40 };
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

  it('regroupe les nœuds internes d\'une icône en UNE seule boîte (= bbox de l\'icône)', () => {
    // 2 vecteurs internes à l'icône 'icon1' → 1 seul highlight, clé = l'icône, boîte = iconBb.
    const nodes = [
      nd({ nodeId: 'v1', significance: 'minor', instance_root: 'icon1', instance_name: 'icon/wifi', instance_after_bbox: iconBb }),
      nd({ nodeId: 'v2', significance: 'minor', instance_root: 'icon1', instance_name: 'icon/wifi', instance_after_bbox: iconBb }),
    ];
    const h = buildHighlights(nodes, false, true);
    expect(h).toHaveLength(1);
    expect(h[0].nodeId).toBe('icon1');
    expect(h[0].bbox).toEqual(iconBb);
  });

  it('un nœud hors instance reste sa propre boîte (fallback : aucun instance_root)', () => {
    const nodes = [
      nd({ nodeId: 'v1', instance_root: 'icon1', instance_after_bbox: iconBb }),
      nd({ nodeId: 'solo' }), // pas d'instance_root → boîte propre
    ];
    const h = buildHighlights(nodes, false, false);
    expect(h.map(x => x.nodeId).sort()).toEqual(['icon1', 'solo']);
    expect(h.find(x => x.nodeId === 'solo')?.bbox).toEqual(bb);
  });

  it('groupe notable si AU MOINS un membre est notable (sinon derived)', () => {
    // icône avec 1 vecteur notable + 1 dérivé → le groupe est "modified" (tone notable).
    const nodes = [
      nd({ nodeId: 'v1', significance: 'notable', instance_root: 'icon1', instance_after_bbox: iconBb }),
      nd({ nodeId: 'v2', significance: 'minor',   instance_root: 'icon1', instance_after_bbox: iconBb }),
    ];
    const g = groupDiffs(nodes);
    expect(g).toHaveLength(1);
    expect(g[0].significance).toBe('notable');
    // Et le groupe apparaît même sans showDerived (il est notable).
    expect(buildHighlights(nodes, false, false).map(x => `${x.nodeId}:${x.tone}`)).toEqual(['icon1:modified']);
  });
});
