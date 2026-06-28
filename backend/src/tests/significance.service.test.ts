import { describe, it, expect } from 'vitest';
import { scoreChange, rankDelta, nodeIdsToRender, derivedMoveIds } from '../services/significance.service.js';
import type { LayoutContext } from '../services/significance.service.js';
import type { PropertyChange, DeltaJSON, NodeDelta } from '../types/figma.js';

const ch = (over: Partial<PropertyChange>): PropertyChange =>
  ({ property: 'x', oldValue: 0, newValue: 0, ...over });

describe('scoreChange', () => {
  it('propriété qualitative (fills) → toujours notable', () => {
    expect(scoreChange(ch({ property: 'fills', oldValue: 'a', newValue: 'b' }))).toBe('notable');
  });

  it('texte (characters) → notable', () => {
    expect(scoreChange(ch({ property: 'characters', oldValue: 'Hi', newValue: 'Hello' }))).toBe('notable');
  });

  it('déplacement ≥ 1px → notable', () => {
    expect(scoreChange(ch({ property: 'x', oldValue: 10, newValue: 12 }))).toBe('notable');
  });

  it('déplacement < 1px → minor', () => {
    expect(scoreChange(ch({ property: 'x', oldValue: 10, newValue: 10.3 }))).toBe('minor');
  });

  it('opacité : Δ ≥ 0.05 → notable, sinon minor', () => {
    expect(scoreChange(ch({ property: 'opacity', oldValue: 1, newValue: 0.9 }))).toBe('notable');
    expect(scoreChange(ch({ property: 'opacity', oldValue: 1, newValue: 0.99 }))).toBe('minor');
  });

  it('rotation : Δ ≥ 1° → notable, sinon minor', () => {
    expect(scoreChange(ch({ property: 'rotation', oldValue: 0, newValue: 2 }))).toBe('notable');
    expect(scoreChange(ch({ property: 'rotation', oldValue: 0, newValue: 0.2 }))).toBe('minor');
  });

  it('propriété inconnue → conservateur (notable)', () => {
    expect(scoreChange(ch({ property: 'mysteryProp', oldValue: 1, newValue: 1 }))).toBe('notable');
  });

  it('valeurs non numériques sur prop numérique → conservateur (notable)', () => {
    expect(scoreChange(ch({ property: 'x', oldValue: undefined, newValue: 5 }))).toBe('notable');
  });
});

describe('scoreChange — géométrie dérivée (contexte auto-layout)', () => {
  const flowChild: LayoutContext = { layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED', layoutPositioning: 'AUTO' };

  it('x/y d\'un enfant de flux → minor (position recalculée)', () => {
    expect(scoreChange(ch({ property: 'x', oldValue: 0, newValue: 80 }), flowChild)).toBe('minor');
    expect(scoreChange(ch({ property: 'y', oldValue: 0, newValue: 80 }), flowChild)).toBe('minor');
  });

  it('width sur axe FILL/HUG → minor ; FIXED → notable (authored)', () => {
    expect(scoreChange(ch({ property: 'width', oldValue: 100, newValue: 300 }), { layoutSizingHorizontal: 'FILL' })).toBe('minor');
    expect(scoreChange(ch({ property: 'width', oldValue: 100, newValue: 300 }), { layoutSizingHorizontal: 'HUG' })).toBe('minor');
    expect(scoreChange(ch({ property: 'width', oldValue: 100, newValue: 300 }), { layoutSizingHorizontal: 'FIXED' })).toBe('notable');
  });

  it('height via layoutSizingVertical (idem)', () => {
    expect(scoreChange(ch({ property: 'height', oldValue: 100, newValue: 300 }), { layoutSizingVertical: 'FILL' })).toBe('minor');
    expect(scoreChange(ch({ property: 'height', oldValue: 100, newValue: 300 }), { layoutSizingVertical: 'FIXED' })).toBe('notable');
  });

  it('enfant ABSOLU → x/y notable (position authored, pas dérivée)', () => {
    const abs: LayoutContext = { layoutSizingHorizontal: 'FIXED', layoutPositioning: 'ABSOLUTE' };
    expect(scoreChange(ch({ property: 'x', oldValue: 0, newValue: 80 }), abs)).toBe('notable');
  });

  it('sans contexte → comportement actuel (non-régression)', () => {
    expect(scoreChange(ch({ property: 'x', oldValue: 0, newValue: 80 }))).toBe('notable'); // ≥1px
    expect(scoreChange(ch({ property: 'x', oldValue: 0, newValue: 0.2 }))).toBe('minor');  // <1px
  });
});

const node = (name: string, changes: PropertyChange[]): NodeDelta =>
  ({ nodeId: name, nodeName: name, nodeType: 'RECTANGLE', changes });

const delta = (over: Partial<DeltaJSON>): DeltaJSON => ({
  modified: [], added: [], removed: [], totalChanges: 0,
  metadata: { v1CapturedAt: '', v2CapturedAt: '', epsilon: 0.01, processingTimeMs: 0 },
  ...over,
});

describe('rankDelta', () => {
  it('nœud modifié avec ≥1 changement notable → notableModified', () => {
    const d = delta({ modified: [node('Header', [{ property: 'fills', oldValue: 'a', newValue: 'b' }])] });
    const r = rankDelta(d);
    expect(r.notableModified.map(n => n.nodeName)).toEqual(['Header']);
    expect(r.minorModified).toHaveLength(0);
  });

  it('nœud modifié uniquement mineur → minorModified + minorCount', () => {
    const d = delta({ modified: [node('Box', [{ property: 'x', oldValue: 0, newValue: 0.2 }])] });
    const r = rankDelta(d);
    expect(r.minorModified.map(n => n.nodeName)).toEqual(['Box']);
    expect(r.notableModified).toHaveLength(0);
    expect(r.minorCount).toBe(1);
  });

  it('added / removed passent toujours (notables par nature)', () => {
    const d = delta({ added: [node('New', [])], removed: [node('Gone', [])] });
    const r = rankDelta(d);
    expect(r.added.map(n => n.nodeName)).toEqual(['New']);
    expect(r.removed.map(n => n.nodeName)).toEqual(['Gone']);
  });

  it('ne mute pas le delta d\'entrée', () => {
    const d = delta({ modified: [node('Box', [{ property: 'x', oldValue: 0, newValue: 0.2 }])] });
    const before = JSON.stringify(d);
    rankDelta(d);
    expect(JSON.stringify(d)).toBe(before);
  });
});

describe('rankDelta — utilise le contexte layout du NodeDelta', () => {
  it('un nœud dont tous les changements sont dérivés (enfant de flux) → minorModified', () => {
    const n: NodeDelta = {
      nodeId: 'Box', nodeName: 'Box', nodeType: 'FRAME',
      changes: [{ property: 'y', oldValue: 0, newValue: 63 }, { property: 'x', oldValue: 0, newValue: 12 }],
      layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED', layoutPositioning: 'AUTO',
    };
    const r = rankDelta(delta({ modified: [n] }));
    expect(r.minorModified.map(x => x.nodeName)).toEqual(['Box']);
    expect(r.notableModified).toHaveLength(0);
  });

  it('un resize FIXED reste notable malgré le contexte auto-layout', () => {
    const n: NodeDelta = {
      nodeId: 'Logo', nodeName: 'Logo', nodeType: 'RECTANGLE',
      changes: [{ property: 'width', oldValue: 100, newValue: 300 }],
      layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED', layoutPositioning: 'AUTO',
    };
    const r = rankDelta(delta({ modified: [n] }));
    expect(r.notableModified.map(x => x.nodeName)).toEqual(['Logo']);
  });
});

describe('derivedMoveIds', () => {
  const mv = (name: string, dx: number, dy: number) => node(name, [
    { property: 'x', oldValue: 0, newValue: dx }, { property: 'y', oldValue: 0, newValue: dy },
  ]);
  it('enfant porté (même delta que le parent) → dérivé', () => {
    const d = delta({ modified: [mv('Parent', 10, 0), mv('Child', 10, 0)] });
    const parent = new Map<string, string | null>([['Parent', null], ['Child', 'Parent']]);
    expect([...derivedMoveIds(d, parent)]).toEqual(['Child']);
  });
  it('enfant déplacé indépendamment (delta ≠ parent) → authored', () => {
    const d = delta({ modified: [mv('Parent', 10, 0), mv('Child', 15, 0)] });
    const parent = new Map<string, string | null>([['Parent', null], ['Child', 'Parent']]);
    expect(derivedMoveIds(d, parent).has('Child')).toBe(false);
  });
  it('parent non déplacé → enfant authored', () => {
    const d = delta({ modified: [mv('Child', 10, 0)] });
    const parent = new Map<string, string | null>([['Child', 'Parent']]);
    expect(derivedMoveIds(d, parent).has('Child')).toBe(false);
  });
  it('tolérance EPS : écart < 0,5px = dérivé, ≥ 0,5px = authored', () => {
    const parent = new Map<string, string | null>([['Parent', null], ['Child', 'Parent']]);
    const near = delta({ modified: [mv('Parent', 10, 0), mv('Child', 10.4, 0)] });   // écart 0,4
    expect(derivedMoveIds(near, parent).has('Child')).toBe(true);
    const far = delta({ modified: [mv('Parent', 10, 0), mv('Child', 10.6, 0)] });    // écart 0,6
    expect(derivedMoveIds(far, parent).has('Child')).toBe(false);
  });
});

describe('rankDelta — move porté (dérivé du parent)', () => {
  it('nœud dont le seul changement est un move porté → minor', () => {
    const d = delta({ modified: [node('Child', [
      { property: 'x', oldValue: 0, newValue: 10 }, { property: 'y', oldValue: 0, newValue: 0 },
    ])] });
    const r = rankDelta(d, new Set(['Child']));
    expect(r.minorModified.map(n => n.nodeName)).toEqual(['Child']);
    expect(r.notableModified).toHaveLength(0);
  });
  it('move porté + changement couleur → reste notable', () => {
    const d = delta({ modified: [node('Child', [
      { property: 'x', oldValue: 0, newValue: 10 }, { property: 'fills', oldValue: 'a', newValue: 'b' },
    ])] });
    const r = rankDelta(d, new Set(['Child']));
    expect(r.notableModified.map(n => n.nodeName)).toEqual(['Child']);
  });
});

describe('nodeIdsToRender', () => {
  const notable: NodeDelta = { nodeId: 'N', nodeName: 'N', nodeType: 'RECTANGLE', changes: [{ property: 'fill', oldValue: 'a', newValue: 'b' }] };
  const derived: NodeDelta = {
    nodeId: 'D', nodeName: 'D', nodeType: 'FRAME',
    changes: [{ property: 'y', oldValue: 0, newValue: 63 }],
    layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED', layoutPositioning: 'AUTO',
  };

  it('ne retient que les notables (+ added/removed), pas les nœuds dérivés', () => {
    const d = delta({ modified: [notable, derived], added: [node('Add', [])], removed: [node('Rem', [])] });
    const ids = nodeIdsToRender(d, 100);
    expect(ids.has('N')).toBe(true);    // notable
    expect(ids.has('Add')).toBe(true);  // added
    expect(ids.has('Rem')).toBe(true);  // removed
    expect(ids.has('D')).toBe(false);   // dérivé (cascade) → pas de crop
  });

  it('respecte le plafond dur (robuste même si beaucoup de notables)', () => {
    const many = Array.from({ length: 10 }, (_, i) => node('n' + i, [{ property: 'fill', oldValue: 'a', newValue: 'b' }]));
    expect(nodeIdsToRender(delta({ modified: many }), 3).size).toBe(3);
  });
});
