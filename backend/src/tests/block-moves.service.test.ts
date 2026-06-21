import { describe, it, expect } from 'vitest';
import { buildTreeMaps, commonAncestor } from '../services/block-moves.service.js';
import type { NodeSnapshot } from '../types/figma.js';

const node = (id: string, name: string, children: NodeSnapshot[] = []): NodeSnapshot =>
  ({ id, name, type: 'FRAME', x: 0, y: 0, width: 0, height: 0, opacity: 1, fills: [], strokes: [], children } as NodeSnapshot);

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

describe('commonAncestor', () => {
  const { parent } = buildTreeMaps(tree);
  it('deux frères → leur parent', () => {
    expect(commonAncestor(['a1', 'a2'], parent)).toBe('a');
  });
  it('un nœud + son enfant → le nœud (l\'ancêtre)', () => {
    expect(commonAncestor(['a', 'a1'], parent)).toBe('a');
  });
  it('nœuds de branches différentes → la racine commune', () => {
    expect(commonAncestor(['a1', 'b'], parent)).toBe('root');
  });
});
