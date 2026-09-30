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
  it('parent → text (déplacé dans un autre calque)', () => {
    expect(formatChange(ch({ property: 'parent', oldValue: 'Frame 14061', newValue: 'Home' })))
      .toEqual({ kind: 'text', label: 'Parent', from: 'Frame 14061', to: 'Home' });
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
      inAutoLayout: true, layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED', layoutPositioning: 'AUTO',
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

describe('formatChange — trous de détection', () => {
  const f = (property: string, oldValue: unknown, newValue: unknown, delta?: string) => formatChange(ch({ property, oldValue, newValue, delta }));

  it('dégradé (y compris indexé)', () => {
    expect(f('fill.gradient', '#FF0000, #0000FF', '#00FF00, #0000FF')).toEqual({ kind: 'text', label: 'Dégradé', from: '#FF0000, #0000FF', to: '#00FF00, #0000FF' });
    expect(f('fill[1].gradient', 'a', 'b').label).toBe('Dégradé');
  });
  it('image remplacée', () => {
    expect(f('fill.image', 'h1', 'h2', 'image remplacée')).toEqual({ kind: 'generic', label: 'Image', detail: 'image remplacée' });
  });
  it('contours : nombre, couleur indexée, visibilité', () => {
    expect(f('strokes', '0 stroke(s)', '1 stroke(s)', '0 → 1')).toEqual({ kind: 'generic', label: 'Contour', detail: '0 → 1' });
    expect(f('stroke[1]', '#FF0000', '#00FF00')).toEqual({ kind: 'color', label: 'Contour', from: '#FF0000', to: '#00FF00' });
    expect(f('stroke.visible', true, false)).toEqual({ kind: 'visibility', label: 'Contour', visible: false });
  });
  it('ombre : décalage, type, étalement', () => {
    expect(f('effect.offset', '(0, 2)', '(0, 6)')).toEqual({ kind: 'text', label: 'Ombre', from: '(0, 2)', to: '(0, 6)' });
    expect(f('effect[1].type', 'DROP_SHADOW', 'INNER_SHADOW').label).toBe('Ombre');
    expect(f('effect.spread', 0, 4, '+4.00px')).toEqual({ kind: 'generic', label: 'Ombre', detail: '+4.00px' });
  });
  it('auto-layout', () => {
    expect(f('layoutMode', 'HORIZONTAL', 'VERTICAL').label).toBe('Direction');
    expect(f('itemSpacing', 8, 12, '+4.00px')).toEqual({ kind: 'generic', label: 'Espacement', detail: '+4.00px' });
    expect(f('padding', '8/16/8/16', '12/16/8/16')).toEqual({ kind: 'text', label: 'Marges intérieures', from: '8/16/8/16', to: '12/16/8/16' });
    expect(f('primaryAxisAlignItems', 'MIN', 'CENTER').label).toBe('Alignement');
    expect(f('counterAxisAlignItems', 'MIN', 'CENTER').label).toBe('Alignement');
    expect(f('layoutWrap', 'NO_WRAP', 'WRAP').label).toBe('Retour à la ligne');
  });
  it('composant et variante', () => {
    expect(f('component', 'Button', 'Tag')).toEqual({ kind: 'text', label: 'Composant', from: 'Button', to: 'Tag' });
    expect(f('variant.Size', 'Large', 'Small')).toEqual({ kind: 'text', label: 'Variante Size', from: 'Large', to: 'Small' });
  });
});
