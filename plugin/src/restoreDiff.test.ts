import { describe, it, expect } from 'vitest';
import { changedProps } from './restoreDiff.js';
import type { NodeSnapshot } from './types.js';

// Snapshot minimal de base (champs non testés laissés à des valeurs neutres).
function snap(over: Partial<NodeSnapshot>): NodeSnapshot {
  return {
    id: 'n1', name: 'N', type: 'FRAME',
    x: 0, y: 0, width: 100, height: 50,
    opacity: 1, visible: true, rotation: 0,
    fills: [], strokes: [], effects: [], vectorPaths: [],
    children: [],
    ...over,
  } as NodeSnapshot;
}

const CANDIDATES = ['opacity', 'visible', 'rotation', 'x', 'y', 'width', 'height', 'fills', 'characters', 'strokeWeight'];

describe('changedProps', () => {
  it('nœud identique → aucun changement', () => {
    const a = snap({});
    const b = snap({});
    expect(changedProps(a, b, CANDIDATES).size).toBe(0);
  });

  it('opacité différente → incluse', () => {
    const curr = snap({ opacity: 1 });
    const prev = snap({ opacity: 0.5 });
    expect([...changedProps(curr, prev, CANDIDATES)]).toEqual(['opacity']);
  });

  it('différence numérique sous ε (0.01) → ignorée', () => {
    const curr = snap({ x: 10 });
    const prev = snap({ x: 10.005 });
    expect(changedProps(curr, prev, CANDIDATES).has('x')).toBe(false);
  });

  it('différence numérique au-dessus de ε → incluse', () => {
    const curr = snap({ x: 10 });
    const prev = snap({ x: 10.5 });
    expect(changedProps(curr, prev, CANDIDATES).has('x')).toBe(true);
  });

  it('booléen visible différent → inclus', () => {
    expect(changedProps(snap({ visible: true }), snap({ visible: false }), CANDIDATES).has('visible')).toBe(true);
  });

  it('fills différents (couleur) → inclus (comparaison JSON)', () => {
    const curr = snap({ fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }] as NodeSnapshot['fills'] });
    const prev = snap({ fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 1, a: 1 } }] as NodeSnapshot['fills'] });
    expect(changedProps(curr, prev, CANDIDATES).has('fills')).toBe(true);
  });

  it('fills identiques → ignorés', () => {
    const fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }] as NodeSnapshot['fills'];
    expect(changedProps(snap({ fills }), snap({ fills }), CANDIDATES).has('fills')).toBe(false);
  });

  it('conservateur : valeur courante illisible (undefined, ex. figma.mixed) vs cible définie → incluse', () => {
    const curr = snap({ strokeWeight: undefined });
    const prev = snap({ strokeWeight: 2 });
    expect(changedProps(curr, prev, CANDIDATES).has('strokeWeight')).toBe(true);
  });

  it('ne renvoie que des candidats', () => {
    const curr = snap({ name: 'A' });
    const prev = snap({ name: 'B' }); // 'name' n'est pas un candidat
    expect(changedProps(curr, prev, CANDIDATES).has('name')).toBe(false);
  });
});
