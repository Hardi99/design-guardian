import { describe, it, expect } from 'vitest';
import { buildTreeMaps, instanceRootMap, viewportRootMap } from '../services/tree.service.js';
import type { NodeSnapshot } from '../types/figma.js';

const node = (id: string, name: string, children: NodeSnapshot[] = []): NodeSnapshot =>
  ({ id, name, type: 'FRAME', x: 0, y: 0, width: 0, height: 0, opacity: 1, fills: [], strokes: [], children } as NodeSnapshot);

const inst = (id: string, name: string, children: NodeSnapshot[] = []): NodeSnapshot =>
  ({ id, name, type: 'INSTANCE', x: 0, y: 0, width: 0, height: 0, opacity: 1, fills: [], strokes: [], children } as NodeSnapshot);

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

describe('instanceRootMap', () => {
  // root → [ icon(INSTANCE) → [v1, v2], b(FRAME) ]
  const withInstance = node('root', 'Root', [
    inst('icon', 'icon/wifi', [node('v1', 'Vector 1'), node('v2', 'Vector 2')]),
    node('b', 'BlocB'),
  ]);

  it('mappe chaque descendant d\'INSTANCE vers l\'instance (unité atomique = icône)', () => {
    const map = instanceRootMap(withInstance);
    expect(map.get('v1')).toEqual({ id: 'icon', name: 'icon/wifi' });
    expect(map.get('v2')).toEqual({ id: 'icon', name: 'icon/wifi' });
  });

  it('n\'affecte PAS l\'instance elle-même ni les nœuds hors instance (→ têtes de groupe autonomes)', () => {
    const map = instanceRootMap(withInstance);
    expect(map.get('icon')).toBeUndefined();
    expect(map.get('b')).toBeUndefined();
    expect(map.get('root')).toBeUndefined();
  });

  it('instances imbriquées : l\'instance LA PLUS HAUTE gagne (cohérent avec le restore)', () => {
    const nested = node('root', 'Root', [
      inst('outer', 'Card', [inst('inner', 'icon/wifi', [node('v', 'Vector')])]),
    ]);
    const map = instanceRootMap(nested);
    expect(map.get('inner')).toEqual({ id: 'outer', name: 'Card' });
    expect(map.get('v')).toEqual({ id: 'outer', name: 'Card' });
    expect(map.get('outer')).toBeUndefined();
  });
});

describe('viewportRootMap', () => {
  // page → [ Accueil → [Header → [Logo]], Sticker ]
  const page = node('page', 'Écrans app', [
    node('accueil', 'Accueil', [node('header', 'Header', [node('logo', 'Logo')])]),
    node('sticker', 'Sticker libre'),
  ]);

  it('mappe un descendant profond vers son enfant de premier niveau', () => {
    const map = viewportRootMap(page);
    expect(map.get('logo')).toEqual({ id: 'accueil', name: 'Accueil' });
    expect(map.get('header')).toEqual({ id: 'accueil', name: 'Accueil' });
  });

  it('un enfant de premier niveau est son PROPRE viewport', () => {
    const map = viewportRootMap(page);
    expect(map.get('accueil')).toEqual({ id: 'accueil', name: 'Accueil' });
    expect(map.get('sticker')).toEqual({ id: 'sticker', name: 'Sticker libre' });
  });

  it('la racine n\'a pas de viewport (conteneur, pas objet de design)', () => {
    expect(viewportRootMap(page).get('page')).toBeUndefined();
  });

  it('page sans enfant → map vide (pas de crash)', () => {
    expect(viewportRootMap(node('page', 'Vide')).size).toBe(0);
  });
});
