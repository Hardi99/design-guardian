import { describe, it, expect } from 'vitest';
import { ensureNodeIdentity, readDgId, type IdentifiableNode } from './figmaIdentity.js';

// Faux nœud minimal : implémente uniquement ce que l'adaptateur utilise.
function fakeNode(id: string, data: Record<string, string> = {}): IdentifiableNode {
  return {
    id,
    getPluginData: (k) => data[k] ?? '',
    setPluginData: (k, v) => { data[k] = v; },
  };
}

describe('ensureNodeIdentity', () => {
  it('nœud vierge → mint + persiste dg_id et owner', () => {
    const store: Record<string, string> = {};
    const node = fakeNode('node-1', store);
    const id = ensureNodeIdentity(node);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(store.el_uid).toBe(id);
    expect(store.el_owner).toBe('node-1');
  });

  it('nœud déjà stampé (owner = lui) → dg_id stable, pas de réécriture', () => {
    const store: Record<string, string> = { el_uid: 'ABC', el_owner: 'node-1' };
    const node = fakeNode('node-1', store);
    expect(ensureNodeIdentity(node)).toBe('ABC');
    expect(store.el_uid).toBe('ABC');
  });

  it('copie (owner ≠ lui) → re-mint un nouveau dg_id + owner = lui', () => {
    const store: Record<string, string> = { el_uid: 'ABC', el_owner: 'node-1' };
    const node = fakeNode('node-2', store);
    const id = ensureNodeIdentity(node);
    expect(id).not.toBe('ABC');
    expect(store.el_uid).toBe(id);
    expect(store.el_owner).toBe('node-2');
  });
});

describe('readDgId', () => {
  it('renvoie le dg_id stocké', () => {
    expect(readDgId(fakeNode('n', { el_uid: 'ABC' }))).toBe('ABC');
  });
  it('renvoie "" si absent', () => {
    expect(readDgId(fakeNode('n'))).toBe('');
  });
});
