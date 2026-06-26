import { describe, it, expect } from 'vitest';
import { computeCornerRadii } from './cornerRadii.js';

describe('computeCornerRadii', () => {
  it('coins uniformes → undefined (le scalaire cornerRadius suffit)', () => {
    expect(computeCornerRadii({ topLeftRadius: 8, topRightRadius: 8, bottomRightRadius: 8, bottomLeftRadius: 8 })).toBeUndefined();
  });
  it('coins mixtes → 4-uplet [TL,TR,BR,BL]', () => {
    expect(computeCornerRadii({ topLeftRadius: 8, topRightRadius: 8.5, bottomRightRadius: 8, bottomLeftRadius: 0 })).toEqual([8, 8.5, 8, 0]);
  });
  it('valeur non-numérique (mixed/symbol/absent) → undefined', () => {
    expect(computeCornerRadii({ topLeftRadius: 8, topRightRadius: 8, bottomRightRadius: 8 })).toBeUndefined();
  });
});
