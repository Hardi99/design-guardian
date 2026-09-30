import { describe, it, expect } from 'vitest';
import {
  isTracked, setTracked, countNodes, listFrames, estimateMs, assignFloating,
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
      { id: 'a', key: 'a', name: 'A', type: 'FRAME', tracked: true,  nodes: 100 },
      { id: 'b', key: 'b', name: 'B', type: 'FRAME', tracked: false, nodes: 0 },
      { id: 'c', key: 'c', name: 'C', type: 'FRAME', tracked: true,  nodes: 50 },
    ];
    expect(estimateMs(frames)).toBe(150 * MS_PER_NODE);
  });

  it('aucune frame suivie → 0', () => {
    expect(estimateMs([{ id: 'a', key: 'a', name: 'A', type: 'FRAME', tracked: false, nodes: 0 }])).toBe(0);
  });
});

// ─── Éléments « flottants » ──────────────────────────────────────────────────
// Un collage sans frame sélectionnée pose l'élément sur la PAGE, souvent au même endroit :
// visuellement il est toujours « dans » la frame, mais la capture ne traverse que les
// frames suivies → il serait signalé supprimé. On le rattache à la frame suivie qu'il
// recouvre (son centre y tombe), pour qu'il reste capturé.

describe('assignFloating', () => {
  const box = (id: string, x: number, y: number, w: number, h: number) => ({ id, x, y, w, h });
  const home = box('home', 0, 0, 428, 926);
  const about = box('about', 500, 0, 428, 926);

  it('élément dont le centre tombe dans une frame suivie → rattaché à elle', () => {
    expect(assignFloating([box('g', 179, 0, 70, 70)], [home, about]).get('g')).toBe('home');
  });

  it('élément hors de toute frame suivie → non rattaché', () => {
    expect(assignFloating([box('g', 1000, 1000, 70, 70)], [home, about]).has('g')).toBe(false);
  });

  it('centre dans la frame même s\'il déborde → rattaché', () => {
    expect(assignFloating([box('g', 380, 100, 70, 70)], [home, about]).get('g')).toBe('home');
  });

  it('élément au moins aussi grand que la frame (autre écran, fond) → non rattaché', () => {
    expect(assignFloating([box('bg', -10, -10, 450, 950)], [home]).has('bg')).toBe(false);
  });

  it('frames suivies qui se chevauchent → la plus haute (dernière dans l\'ordre des calques)', () => {
    const over = box('over', 0, 0, 300, 300);
    expect(assignFloating([box('g', 10, 10, 20, 20)], [home, over]).get('g')).toBe('over');
  });
});

// Clé de navigation d'une frame (Phase 3) : son dg_id (el_uid) s'il existe, sinon son id.
// Lister ne doit RIEN écrire dans le fichier (pas de stamp à l'énumération).
describe('listFrames — clé', () => {
  it('key = el_uid si présent, sinon id ; aucune écriture', () => {
    let writes = 0;
    const node = (id: string, data: Record<string, string>): TrackableNode => ({
      id, name: id, type: 'FRAME', width: 1, height: 1, children: [],
      getPluginData: (k) => data[k] ?? '',
      setPluginData: () => { writes++; },
    });
    const out = listFrames([node('1:1', { el_uid: 'DG-A', el_owner: '1:1' }), node('1:2', {})]);
    expect(out.map(f => f.key)).toEqual(['DG-A', '1:2']);
    expect(writes).toBe(0);
  });
});

// Frame dupliquée (Ctrl+D) : le double copie le pluginData, donc l'el_uid de l'original, avec
// un propriétaire (el_owner) différent. Sa clé ne doit PAS être celle de l'original, sinon la
// liste lui attribuerait l'historique de l'original.
describe('listFrames — frame dupliquée', () => {
  it('el_uid pris seulement si la frame en est propriétaire ; sinon son id', () => {
    const node = (id: string, data: Record<string, string>): TrackableNode => ({
      id, name: id, type: 'FRAME', width: 1, height: 1, children: [],
      getPluginData: (k) => data[k] ?? '', setPluginData: () => {},
    });
    const out = listFrames([
      node('1:1', { el_uid: 'DG-A', el_owner: '1:1' }),
      node('1:9', { el_uid: 'DG-A', el_owner: '1:1' }), // la copie
    ]);
    expect(out.map(f => f.key)).toEqual(['DG-A', '1:9']);
  });
});
