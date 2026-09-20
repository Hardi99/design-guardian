import { describe, it, expect } from 'vitest';
import {
  isTracked, setTracked, countNodes, listFrames, estimateMs,
  TRACKED_KEY, MS_PER_NODE, type TrackableNode,
} from './trackedFrames.js';

function fake(id: string, name: string, children: TrackableNode[] = [], data: Record<string, string> = {}): TrackableNode {
  return {
    id, name, type: 'FRAME', width: 100, height: 100, children,
    getPluginData: (k) => data[k] ?? '',
    setPluginData: (k, v) => { data[k] = v; },
  };
}

describe('isTracked / setTracked', () => {
  it('un nœud vierge n\'est pas suivi (rien n\'est suivi par défaut)', () => {
    expect(isTracked(fake('a', 'A'))).toBe(false);
  });

  it('setTracked(true) puis isTracked → true', () => {
    const n = fake('a', 'A');
    setTracked(n, true);
    expect(n.getPluginData(TRACKED_KEY)).toBe('1');
    expect(isTracked(n)).toBe(true);
  });

  it('setTracked(false) efface la marque', () => {
    const n = fake('a', 'A');
    setTracked(n, true);
    setTracked(n, false);
    expect(isTracked(n)).toBe(false);
  });
});

describe('countNodes', () => {
  it('compte le nœud et tous ses descendants', () => {
    const tree = fake('f', 'F', [fake('a', 'A', [fake('a1', 'A1')]), fake('b', 'B')]);
    expect(countNodes(tree)).toBe(4);
  });

  it('un nœud sans enfant compte pour 1', () => {
    expect(countNodes(fake('solo', 'Solo'))).toBe(1);
  });
});

describe('listFrames', () => {
  it('liste toutes les frames, suivies ou non', () => {
    const a = fake('a', 'Accueil');
    const b = fake('b', 'Panier');
    setTracked(a, true);
    const out = listFrames([a, b]);
    expect(out.map(f => [f.id, f.tracked])).toEqual([['a', true], ['b', false]]);
  });

  it('ne compte les nœuds QUE pour les frames suivies (la liste doit rester instantanée)', () => {
    const a = fake('a', 'Accueil', [fake('x', 'X'), fake('y', 'Y')]);
    const b = fake('b', 'Panier', [fake('z', 'Z')]);
    setTracked(a, true);
    const out = listFrames([a, b]);
    expect(out.find(f => f.id === 'a')?.nodes).toBe(3); // a + x + y
    expect(out.find(f => f.id === 'b')?.nodes).toBe(0); // non suivie → pas traversée
  });
});

describe('estimateMs', () => {
  it('somme les nœuds des frames suivies × le taux mesuré', () => {
    const frames = [
      { id: 'a', name: 'A', type: 'FRAME', tracked: true,  nodes: 100 },
      { id: 'b', name: 'B', type: 'FRAME', tracked: false, nodes: 0 },
      { id: 'c', name: 'C', type: 'FRAME', tracked: true,  nodes: 50 },
    ];
    expect(estimateMs(frames)).toBe(150 * MS_PER_NODE);
  });

  it('aucune frame suivie → 0', () => {
    expect(estimateMs([{ id: 'a', name: 'A', type: 'FRAME', tracked: false, nodes: 0 }])).toBe(0);
  });
});
