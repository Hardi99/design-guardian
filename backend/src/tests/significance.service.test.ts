import { describe, it, expect } from 'vitest';
import { scoreChange, rankDelta } from '../services/significance.service.js';
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
