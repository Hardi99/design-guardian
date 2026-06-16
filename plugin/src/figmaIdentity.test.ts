import { describe, it, expect } from 'vitest';
import { ensureNodeIdentity, readDgId, propagateIdentity, findByDgId, type IdentifiableNode, type BranchNode } from './figmaIdentity.js';

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

// Arbre falsifié avec enfants (pour la propagation au clone).
function fakeTree(id: string, store: Record<string, string>, children: BranchNode[] = []): BranchNode {
  return {
    id,
    getPluginData: (k) => store[k] ?? '',
    setPluginData: (k, v) => { store[k] = v; },
    children,
  };
}

describe('propagateIdentity', () => {
  it('copie le dg_id de l\'original vers le clone, owner = clone (pas re-mint)', () => {
    const oStore: Record<string, string> = { el_uid: 'ABC', el_owner: 'orig-1' };
    const cStore: Record<string, string> = {};
    propagateIdentity(fakeTree('orig-1', oStore), fakeTree('clone-1', cStore));
    expect(cStore.el_uid).toBe('ABC');        // identité partagée cross-branche
    expect(cStore.el_owner).toBe('clone-1');  // owner = soi → decideStamp ne re-mint pas
  });

  it('stampe l\'original s\'il n\'a pas de dg_id, puis propage', () => {
    const oStore: Record<string, string> = {};
    const cStore: Record<string, string> = {};
    propagateIdentity(fakeTree('orig-1', oStore), fakeTree('clone-1', cStore));
    expect(oStore.el_uid).toMatch(/^[0-9a-f-]{36}$/); // original stampé
    expect(cStore.el_uid).toBe(oStore.el_uid);        // clone partage la même clé
    expect(cStore.el_owner).toBe('clone-1');
  });

  it('propage récursivement sur les enfants (appariés par index)', () => {
    const ocStore: Record<string, string> = { el_uid: 'CHILD', el_owner: 'oc-1' };
    const ccStore: Record<string, string> = {};
    const original = fakeTree('o-1', { el_uid: 'ROOT', el_owner: 'o-1' }, [fakeTree('oc-1', ocStore)]);
    const clone = fakeTree('c-1', {}, [fakeTree('cc-1', ccStore)]);
    propagateIdentity(original, clone);
    expect(ccStore.el_uid).toBe('CHILD');
    expect(ccStore.el_owner).toBe('cc-1');
  });
});

describe('findByDgId', () => {
  it('trouve un nœud par dg_id à la racine', () => {
    const n = fakeTree('a', { el_uid: 'X' });
    expect(findByDgId([n], 'X')).toBe(n);
  });

  it('trouve un nœud imbriqué en profondeur', () => {
    const target = fakeTree('c', { el_uid: 'DEEP' });
    const root = fakeTree('a', { el_uid: 'ROOT' }, [fakeTree('b', {}, [target])]);
    expect(findByDgId([root], 'DEEP')).toBe(target);
  });

  it('renvoie undefined si introuvable', () => {
    expect(findByDgId([fakeTree('a', { el_uid: 'X' })], 'NOPE')).toBeUndefined();
  });
});
