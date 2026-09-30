import { describe, it, expect } from 'vitest';
import { ensureNodeIdentity, readDgId, propagateIdentity, findByDgId, adoptMovedIdentities, type IdentifiableNode, type BranchNode } from './figmaIdentity.js';

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

// ─── Lecture seule ───────────────────────────────────────────────────────────
// Un nœud qu'on ne peut pas stamper ne doit PAS recevoir un dg_id tiré au hasard à
// chaque capture : il ne correspondrait jamais à la capture précédente (tout serait
// « supprimé + ajouté »). Pas d'identité → le diff apparie par id Figma.

describe('ensureNodeIdentity — lecture seule', () => {
  const readOnly = (id: string, data: Record<string, string> = {}): IdentifiableNode => ({
    id,
    getPluginData: (k) => data[k] ?? '',
    setPluginData: () => { throw new Error('read-only'); },
  });

  it('nœud vierge non stampable → "" (pas de dg_id volatile)', () => {
    expect(ensureNodeIdentity(readOnly('n1'))).toBe('');
  });

  it('nœud déjà stampé → son dg_id, même en lecture seule', () => {
    expect(ensureNodeIdentity(readOnly('n1', { el_uid: 'ABC', el_owner: 'n1' }))).toBe('ABC');
  });
});

// ─── Couper-coller / « Move to page » ────────────────────────────────────────
// Figma donne un NOUVEL id au nœud collé, qui garde son pluginData (owner = l'ancien id).
// Copie ou déplacement ? Copie seulement si le propriétaire existe encore avec ce dg_id.

describe('adoptMovedIdentities', () => {
  const lookup = (nodes: IdentifiableNode[]) =>
    async (id: string) => nodes.find(n => n.id === id) ?? null;

  it('couper-coller (ancien nœud disparu) → le nœud collé garde son dg_id', async () => {
    const pasted = fakeTree('new-2', { el_uid: 'ABC', el_owner: 'old-1' });
    await adoptMovedIdentities([pasted], lookup([]));
    expect(ensureNodeIdentity(pasted)).toBe('ABC');
    expect(pasted.getPluginData('el_owner')).toBe('new-2');
  });

  it('copie (original toujours là avec ce dg_id) → pas d\'adoption, re-mint', async () => {
    const original = fakeNode('n1', { el_uid: 'ABC', el_owner: 'n1' });
    const copy = fakeTree('n2', { el_uid: 'ABC', el_owner: 'n1' });
    await adoptMovedIdentities([copy], lookup([original]));
    expect(ensureNodeIdentity(copy)).not.toBe('ABC');
  });

  it('propriétaire toujours là mais avec un autre dg_id → l\'identité est libre, adoptée', async () => {
    const formerOwner = fakeNode('n1', { el_uid: 'OTHER', el_owner: 'n1' });
    const node = fakeTree('n2', { el_uid: 'ABC', el_owner: 'n1' });
    await adoptMovedIdentities([node], lookup([formerOwner]));
    expect(ensureNodeIdentity(node)).toBe('ABC');
  });

  it('collé deux fois dans l\'arbre capturé → un seul hérite, l\'autre est re-minté', async () => {
    const a = fakeTree('p1', { el_uid: 'ABC', el_owner: 'gone' });
    const b = fakeTree('p2', { el_uid: 'ABC', el_owner: 'gone' });
    const root = fakeTree('root', { el_uid: 'R', el_owner: 'root' }, [a, b]);
    await adoptMovedIdentities([root], lookup([]));
    const ids = [ensureNodeIdentity(a), ensureNodeIdentity(b)];
    expect(ids).toContain('ABC');
    expect(new Set(ids).size).toBe(2);
  });

  it('original et copie dans l\'arbre capturé → la copie n\'hérite pas', async () => {
    const original = fakeTree('n1', { el_uid: 'ABC', el_owner: 'n1' });
    const copy = fakeTree('n2', { el_uid: 'ABC', el_owner: 'n1' });
    const root = fakeTree('root', { el_uid: 'R', el_owner: 'root' }, [copy, original]);
    await adoptMovedIdentities([root], lookup([])); // même si la recherche ne trouvait pas l'original
    expect(ensureNodeIdentity(original)).toBe('ABC');
    expect(ensureNodeIdentity(copy)).not.toBe('ABC');
  });
});
