import { describe, it, expect } from 'vitest';
import { formatChange, weightName, formatNodeChanges } from '../services/change-format.service.js';
import type { PropertyChange, NodeDelta } from '../types/figma.js';

const ch = (o: Partial<PropertyChange>): PropertyChange => ({ property: 'x', oldValue: 0, newValue: 0, ...o });

describe('weightName', () => {
  it('mappe les poids connus', () => {
    expect(weightName(400)).toBe('Regular');
    expect(weightName(600)).toBe('SemiBold');
    expect(weightName(800)).toBe('ExtraBold');
  });
  it('repli sur la valeur brute si inconnu', () => expect(weightName(450)).toBe('450'));
});

describe('formatChange', () => {
  it('fill → color, hex conservés', () => {
    expect(formatChange(ch({ property: 'fill', oldValue: '#00F0FF', newValue: '#4B898D' })))
      .toEqual({ kind: 'color', label: 'Couleur', from: '#00F0FF', to: '#4B898D' });
  });
  it('fontWeight → weight nommé', () => {
    expect(formatChange(ch({ property: 'fontWeight', oldValue: 600, newValue: 800 })))
      .toEqual({ kind: 'weight', label: 'Graisse', from: 'SemiBold', to: 'ExtraBold' });
  });
  it('rotation → degrés (new - old)', () => {
    expect(formatChange(ch({ property: 'rotation', oldValue: -180, newValue: 0 })))
      .toEqual({ kind: 'rotation', label: 'Rotation', degrees: 180 });
  });
  it('characters → text', () => {
    expect(formatChange(ch({ property: 'characters', oldValue: 'Hi', newValue: 'Hello' })))
      .toEqual({ kind: 'text', label: 'Texte', from: 'Hi', to: 'Hello' });
  });
  it('opacity → %', () => {
    expect(formatChange(ch({ property: 'opacity', oldValue: 1, newValue: 0.5 })))
      .toEqual({ kind: 'opacity', label: 'Opacité', from: 100, to: 50 });
  });
  it('propriété inconnue → generic (jamais d\'invention)', () => {
    expect(formatChange(ch({ property: 'mystery', oldValue: 1, newValue: 2, delta: '1 → 2' })))
      .toEqual({ kind: 'generic', label: 'mystery', detail: '1 → 2' });
  });
});

const nd = (over: Partial<NodeDelta>): NodeDelta =>
  ({ nodeId: 'n', nodeName: 'n', nodeType: 'FRAME', changes: [], ...over });

describe('formatNodeChanges', () => {
  it('fusionne x + y en un seul move', () => {
    const r = formatNodeChanges(nd({ changes: [
      { property: 'x', oldValue: 0, newValue: 4 },
      { property: 'y', oldValue: 0, newValue: -3 },
    ] }));
    expect(r).toEqual([{ kind: 'move', label: 'Position', dx: 4, dy: -3 }]);
  });

  it('fusionne width + height en un seul resize', () => {
    const r = formatNodeChanges(nd({ changes: [
      { property: 'width', oldValue: 100, newValue: 120 },
      { property: 'height', oldValue: 50, newValue: 50 },
    ] }));
    expect(r).toEqual([{ kind: 'resize', label: 'Taille', dw: 20, dh: 0 }]);
  });

  it('ignore les changements mineurs (cascade : x/y d\'un enfant de flux)', () => {
    const r = formatNodeChanges(nd({
      changes: [{ property: 'y', oldValue: 0, newValue: -51 }],
      layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED', layoutPositioning: 'AUTO',
    }));
    expect(r).toEqual([]); // dérivé → mineur → pas listé
  });

  it('garde une couleur (notable)', () => {
    const r = formatNodeChanges(nd({ changes: [
      { property: 'fill', oldValue: '#FFFFFF', newValue: '#FF0101' },
    ] }));
    expect(r).toEqual([{ kind: 'color', label: 'Couleur', from: '#FFFFFF', to: '#FF0101' }]);
  });
});
