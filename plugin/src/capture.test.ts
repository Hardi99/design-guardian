import { describe, it, expect, vi } from 'vitest';
import { autoLayoutOf, strokeOf, spreadOf, variantOf, collectComponents, type TreeLike } from './capture.js';

describe('autoLayoutOf', () => {
  it('cadre en auto-layout → espacement, marges, alignements, retour à la ligne', () => {
    expect(autoLayoutOf({
      layoutMode: 'HORIZONTAL', itemSpacing: 8, paddingTop: 1, paddingRight: 2, paddingBottom: 3, paddingLeft: 4,
      primaryAxisAlignItems: 'MIN', counterAxisAlignItems: 'CENTER', layoutWrap: 'NO_WRAP',
    })).toEqual({
      itemSpacing: 8, paddingTop: 1, paddingRight: 2, paddingBottom: 3, paddingLeft: 4,
      primaryAxisAlignItems: 'MIN', counterAxisAlignItems: 'CENTER', layoutWrap: 'NO_WRAP',
    });
  });
  it('sans auto-layout (NONE ou absent) → undefined', () => {
    expect(autoLayoutOf({ layoutMode: 'NONE', itemSpacing: 8 })).toBeUndefined();
    expect(autoLayoutOf({})).toBeUndefined();
  });
});

describe('strokeOf', () => {
  it('contour uni : couleur (alpha = opacité) et visibilité', () => {
    expect(strokeOf({ type: 'SOLID', color: { r: 1, g: 0, b: 0 }, opacity: 0.5, visible: false }))
      .toEqual({ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 0.5 }, opacity: 0.5, visible: false });
  });
  it('contour non uni : pas de couleur', () => {
    expect(strokeOf({ type: 'GRADIENT_LINEAR', visible: true }).color).toBeUndefined();
  });
});

describe('spreadOf', () => {
  it('étalement d\'une ombre, undefined sinon', () => {
    expect(spreadOf({ type: 'DROP_SHADOW', spread: 4 })).toBe(4);
    expect(spreadOf({ type: 'LAYER_BLUR' })).toBeUndefined();
  });
});

describe('variantOf', () => {
  it('garde VARIANT et BOOLEAN (nom sans suffixe #id), ignore TEXT et INSTANCE_SWAP', () => {
    expect(variantOf({
      Size: { type: 'VARIANT', value: 'Large' },
      'Icon#12:3': { type: 'BOOLEAN', value: true },
      'Label#4:5': { type: 'TEXT', value: 'OK' },
      'Glyph#6:7': { type: 'INSTANCE_SWAP', value: '1:2' },
    })).toEqual({ Size: 'Large', Icon: true });
  });
  it('rien à garder → undefined', () => {
    expect(variantOf(undefined)).toBeUndefined();
    expect(variantOf({ 'Label#1:1': { type: 'TEXT', value: 'x' } })).toBeUndefined();
  });
});

describe('collectComponents', () => {
  const tree: TreeLike = {
    id: 'f', type: 'FRAME', children: [
      { id: 'i1', type: 'INSTANCE', children: [{ id: 'i2', type: 'INSTANCE' }] }, // instance imbriquée
      { id: 'i3', type: 'INSTANCE' },
      { id: 'r', type: 'RECTANGLE' },
    ],
  };

  it('lit le composant principal de chaque instance, imbriquées comprises, indexé par id d\'instance', async () => {
    const getMain = vi.fn(async (n: TreeLike) => n.id === 'i3'
      ? { key: 'k3', name: 'Tag', parent: null }
      : { key: `k-${n.id}`, name: 'Size=Large', parent: { type: 'COMPONENT_SET', name: 'Button' } });
    const out = await collectComponents([tree], getMain);
    expect(getMain).toHaveBeenCalledTimes(3);
    expect(out.get('i1')).toEqual({ key: 'k-i1', name: 'Size=Large', set: 'Button' });
    expect(out.get('i2')?.set).toBe('Button');
    expect(out.get('i3')).toEqual({ key: 'k3', name: 'Tag' });
  });

  it('une lecture qui échoue est simplement absente', async () => {
    const out = await collectComponents([tree], async (n) => {
      if (n.id === 'i1') throw new Error('boom');
      return { key: 'k', name: 'X', parent: null };
    });
    expect(out.has('i1')).toBe(false);
    expect(out.has('i3')).toBe(true);
  });
});
