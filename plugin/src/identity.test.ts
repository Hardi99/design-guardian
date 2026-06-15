import { describe, it, expect } from 'vitest';
import { generateDgId, decideStamp } from './identity.js';

describe('generateDgId', () => {
  it('produit un UUID v4 valide', () => {
    expect(generateDgId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('produit des valeurs différentes', () => {
    expect(generateDgId()).not.toBe(generateDgId());
  });
});

describe('decideStamp', () => {
  const mint = () => 'NEW';

  it('aucun stamp → bootstrap (mint + owner = ce nœud, à écrire)', () => {
    expect(decideStamp('node-1', {}, mint)).toEqual({
      dgId: 'NEW', ownerNodeId: 'node-1', mustWrite: true,
    });
  });

  it('stamp valide appartenant à ce nœud → conservé, rien à écrire', () => {
    expect(decideStamp('node-1', { dgId: 'ABC', ownerNodeId: 'node-1' }, mint)).toEqual({
      dgId: 'ABC', ownerNodeId: 'node-1', mustWrite: false,
    });
  });

  it('stamp dont owner ≠ ce nœud (copie) → re-mint', () => {
    expect(decideStamp('node-2', { dgId: 'ABC', ownerNodeId: 'node-1' }, mint)).toEqual({
      dgId: 'NEW', ownerNodeId: 'node-2', mustWrite: true,
    });
  });
});
